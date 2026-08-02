import { DiffChange } from "./diffChange.js";
import { stringHash } from "../hash.js";
import { Constants } from "../uint.js";
class StringDiffSequence {
  constructor(source) {
    this.source = source;
  }
  getElements() {
    const source = this.source;
    const characters = new Int32Array(source.length);
    for (let i = 0, len = source.length; i < len; i++) {
      characters[i] = source.charCodeAt(i);
    }
    return characters;
  }
}
function stringDiff(original, modified, pretty) {
  return new LcsDiff(new StringDiffSequence(original), new StringDiffSequence(modified)).ComputeDiff(pretty).changes;
}
class Debug {
  static Assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }
}
class MyArray {
  /**
   * Copies a range of elements from an Array starting at the specified source index and pastes
   * them to another Array starting at the specified destination index. The length and the indexes
   * are specified as 64-bit integers.
   * sourceArray:
   *		The Array that contains the data to copy.
   * sourceIndex:
   *		A 64-bit integer that represents the index in the sourceArray at which copying begins.
   * destinationArray:
   *		The Array that receives the data.
   * destinationIndex:
   *		A 64-bit integer that represents the index in the destinationArray at which storing begins.
   * length:
   *		A 64-bit integer that represents the number of elements to copy.
   */
  static Copy(sourceArray, sourceIndex, destinationArray, destinationIndex, length) {
    for (let i = 0; i < length; i++) {
      destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
    }
  }
  static Copy2(sourceArray, sourceIndex, destinationArray, destinationIndex, length) {
    for (let i = 0; i < length; i++) {
      destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
    }
  }
}
var LocalConstants = /* @__PURE__ */ ((LocalConstants2) => {
  LocalConstants2[LocalConstants2["MaxDifferencesHistory"] = 1447] = "MaxDifferencesHistory";
  return LocalConstants2;
})(LocalConstants || {});
class DiffChangeHelper {
  /**
   * Constructs a new DiffChangeHelper for the given DiffSequences.
   */
  constructor() {
    this.m_changes = [];
    this.m_originalStart = Constants.MAX_SAFE_SMALL_INTEGER;
    this.m_modifiedStart = Constants.MAX_SAFE_SMALL_INTEGER;
    this.m_originalCount = 0;
    this.m_modifiedCount = 0;
  }
  /**
   * Marks the beginning of the next change in the set of differences.
   */
  MarkNextChange() {
    if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
      this.m_changes.push(new DiffChange(
        this.m_originalStart,
        this.m_originalCount,
        this.m_modifiedStart,
        this.m_modifiedCount
      ));
    }
    this.m_originalCount = 0;
    this.m_modifiedCount = 0;
    this.m_originalStart = Constants.MAX_SAFE_SMALL_INTEGER;
    this.m_modifiedStart = Constants.MAX_SAFE_SMALL_INTEGER;
  }
  /**
   * Adds the original element at the given position to the elements
   * affected by the current change. The modified index gives context
   * to the change position with respect to the original sequence.
   * @param originalIndex The index of the original element to add.
   * @param modifiedIndex The index of the modified element that provides corresponding position in the modified sequence.
   */
  AddOriginalElement(originalIndex, modifiedIndex) {
    this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
    this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);
    this.m_originalCount++;
  }
  /**
   * Adds the modified element at the given position to the elements
   * affected by the current change. The original index gives context
   * to the change position with respect to the modified sequence.
   * @param originalIndex The index of the original element that provides corresponding position in the original sequence.
   * @param modifiedIndex The index of the modified element to add.
   */
  AddModifiedElement(originalIndex, modifiedIndex) {
    this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
    this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);
    this.m_modifiedCount++;
  }
  /**
   * Retrieves all of the changes marked by the class.
   */
  getChanges() {
    if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
      this.MarkNextChange();
    }
    return this.m_changes;
  }
  /**
   * Retrieves all of the changes marked by the class in the reverse order
   */
  getReverseChanges() {
    if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
      this.MarkNextChange();
    }
    this.m_changes.reverse();
    return this.m_changes;
  }
}
class LcsDiff {
  /**
   * Constructs the DiffFinder
   */
  constructor(originalSequence, modifiedSequence, continueProcessingPredicate = null) {
    this.ContinueProcessingPredicate = continueProcessingPredicate;
    this._originalSequence = originalSequence;
    this._modifiedSequence = modifiedSequence;
    const [originalStringElements, originalElementsOrHash, originalHasStrings] = LcsDiff._getElements(originalSequence);
    const [modifiedStringElements, modifiedElementsOrHash, modifiedHasStrings] = LcsDiff._getElements(modifiedSequence);
    this._hasStrings = originalHasStrings && modifiedHasStrings;
    this._originalStringElements = originalStringElements;
    this._originalElementsOrHash = originalElementsOrHash;
    this._modifiedStringElements = modifiedStringElements;
    this._modifiedElementsOrHash = modifiedElementsOrHash;
    this.m_forwardHistory = [];
    this.m_reverseHistory = [];
  }
  static _isStringArray(arr) {
    return arr.length > 0 && typeof arr[0] === "string";
  }
  static _getElements(sequence) {
    const elements = sequence.getElements();
    if (LcsDiff._isStringArray(elements)) {
      const hashes = new Int32Array(elements.length);
      for (let i = 0, len = elements.length; i < len; i++) {
        hashes[i] = stringHash(elements[i], 0);
      }
      return [elements, hashes, true];
    }
    if (elements instanceof Int32Array) {
      return [[], elements, false];
    }
    return [[], new Int32Array(elements), false];
  }
  ElementsAreEqual(originalIndex, newIndex) {
    if (this._originalElementsOrHash[originalIndex] !== this._modifiedElementsOrHash[newIndex]) {
      return false;
    }
    return this._hasStrings ? this._originalStringElements[originalIndex] === this._modifiedStringElements[newIndex] : true;
  }
  ElementsAreStrictEqual(originalIndex, newIndex) {
    if (!this.ElementsAreEqual(originalIndex, newIndex)) {
      return false;
    }
    const originalElement = LcsDiff._getStrictElement(this._originalSequence, originalIndex);
    const modifiedElement = LcsDiff._getStrictElement(this._modifiedSequence, newIndex);
    return originalElement === modifiedElement;
  }
  static _getStrictElement(sequence, index) {
    if (typeof sequence.getStrictElement === "function") {
      return sequence.getStrictElement(index);
    }
    return null;
  }
  OriginalElementsAreEqual(index1, index2) {
    if (this._originalElementsOrHash[index1] !== this._originalElementsOrHash[index2]) {
      return false;
    }
    return this._hasStrings ? this._originalStringElements[index1] === this._originalStringElements[index2] : true;
  }
  ModifiedElementsAreEqual(index1, index2) {
    if (this._modifiedElementsOrHash[index1] !== this._modifiedElementsOrHash[index2]) {
      return false;
    }
    return this._hasStrings ? this._modifiedStringElements[index1] === this._modifiedStringElements[index2] : true;
  }
  ComputeDiff(pretty) {
    return this._ComputeDiff(0, this._originalElementsOrHash.length - 1, 0, this._modifiedElementsOrHash.length - 1, pretty);
  }
  /**
   * Computes the differences between the original and modified input
   * sequences on the bounded range.
   * @returns An array of the differences between the two input sequences.
   */
  _ComputeDiff(originalStart, originalEnd, modifiedStart, modifiedEnd, pretty) {
    const quitEarlyArr = [false];
    let changes = this.ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr);
    if (pretty) {
      changes = this.PrettifyChanges(changes);
    }
    return {
      quitEarly: quitEarlyArr[0],
      changes
    };
  }
  /**
   * Private helper method which computes the differences on the bounded range
   * recursively.
   * @returns An array of the differences between the two input sequences.
   */
  ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr) {
    quitEarlyArr[0] = false;
    while (originalStart <= originalEnd && modifiedStart <= modifiedEnd && this.ElementsAreEqual(originalStart, modifiedStart)) {
      originalStart++;
      modifiedStart++;
    }
    while (originalEnd >= originalStart && modifiedEnd >= modifiedStart && this.ElementsAreEqual(originalEnd, modifiedEnd)) {
      originalEnd--;
      modifiedEnd--;
    }
    if (originalStart > originalEnd || modifiedStart > modifiedEnd) {
      let changes;
      if (modifiedStart <= modifiedEnd) {
        Debug.Assert(originalStart === originalEnd + 1, "originalStart should only be one more than originalEnd");
        changes = [
          new DiffChange(originalStart, 0, modifiedStart, modifiedEnd - modifiedStart + 1)
        ];
      } else if (originalStart <= originalEnd) {
        Debug.Assert(modifiedStart === modifiedEnd + 1, "modifiedStart should only be one more than modifiedEnd");
        changes = [
          new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, 0)
        ];
      } else {
        Debug.Assert(originalStart === originalEnd + 1, "originalStart should only be one more than originalEnd");
        Debug.Assert(modifiedStart === modifiedEnd + 1, "modifiedStart should only be one more than modifiedEnd");
        changes = [];
      }
      return changes;
    }
    const midOriginalArr = [0];
    const midModifiedArr = [0];
    const result = this.ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr);
    const midOriginal = midOriginalArr[0];
    const midModified = midModifiedArr[0];
    if (result !== null) {
      return result;
    } else if (!quitEarlyArr[0]) {
      const leftChanges = this.ComputeDiffRecursive(originalStart, midOriginal, modifiedStart, midModified, quitEarlyArr);
      let rightChanges = [];
      if (!quitEarlyArr[0]) {
        rightChanges = this.ComputeDiffRecursive(midOriginal + 1, originalEnd, midModified + 1, modifiedEnd, quitEarlyArr);
      } else {
        rightChanges = [
          new DiffChange(midOriginal + 1, originalEnd - (midOriginal + 1) + 1, midModified + 1, modifiedEnd - (midModified + 1) + 1)
        ];
      }
      return this.ConcatenateChanges(leftChanges, rightChanges);
    }
    return [
      new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, modifiedEnd - modifiedStart + 1)
    ];
  }
  WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr) {
    let forwardChanges = null;
    let reverseChanges = null;
    let changeHelper = new DiffChangeHelper();
    let diagonalMin = diagonalForwardStart;
    let diagonalMax = diagonalForwardEnd;
    let diagonalRelative = midOriginalArr[0] - midModifiedArr[0] - diagonalForwardOffset;
    let lastOriginalIndex = Constants.MIN_SAFE_SMALL_INTEGER;
    let historyIndex = this.m_forwardHistory.length - 1;
    do {
      const diagonal = diagonalRelative + diagonalForwardBase;
      if (diagonal === diagonalMin || diagonal < diagonalMax && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1]) {
        originalIndex = forwardPoints[diagonal + 1];
        modifiedIndex = originalIndex - diagonalRelative - diagonalForwardOffset;
        if (originalIndex < lastOriginalIndex) {
          changeHelper.MarkNextChange();
        }
        lastOriginalIndex = originalIndex;
        changeHelper.AddModifiedElement(originalIndex + 1, modifiedIndex);
        diagonalRelative = diagonal + 1 - diagonalForwardBase;
      } else {
        originalIndex = forwardPoints[diagonal - 1] + 1;
        modifiedIndex = originalIndex - diagonalRelative - diagonalForwardOffset;
        if (originalIndex < lastOriginalIndex) {
          changeHelper.MarkNextChange();
        }
        lastOriginalIndex = originalIndex - 1;
        changeHelper.AddOriginalElement(originalIndex, modifiedIndex + 1);
        diagonalRelative = diagonal - 1 - diagonalForwardBase;
      }
      if (historyIndex >= 0) {
        forwardPoints = this.m_forwardHistory[historyIndex];
        diagonalForwardBase = forwardPoints[0];
        diagonalMin = 1;
        diagonalMax = forwardPoints.length - 1;
      }
    } while (--historyIndex >= -1);
    forwardChanges = changeHelper.getReverseChanges();
    if (quitEarlyArr[0]) {
      let originalStartPoint = midOriginalArr[0] + 1;
      let modifiedStartPoint = midModifiedArr[0] + 1;
      if (forwardChanges !== null && forwardChanges.length > 0) {
        const lastForwardChange = forwardChanges[forwardChanges.length - 1];
        originalStartPoint = Math.max(originalStartPoint, lastForwardChange.getOriginalEnd());
        modifiedStartPoint = Math.max(modifiedStartPoint, lastForwardChange.getModifiedEnd());
      }
      reverseChanges = [
        new DiffChange(
          originalStartPoint,
          originalEnd - originalStartPoint + 1,
          modifiedStartPoint,
          modifiedEnd - modifiedStartPoint + 1
        )
      ];
    } else {
      changeHelper = new DiffChangeHelper();
      diagonalMin = diagonalReverseStart;
      diagonalMax = diagonalReverseEnd;
      diagonalRelative = midOriginalArr[0] - midModifiedArr[0] - diagonalReverseOffset;
      lastOriginalIndex = Constants.MAX_SAFE_SMALL_INTEGER;
      historyIndex = deltaIsEven ? this.m_reverseHistory.length - 1 : this.m_reverseHistory.length - 2;
      do {
        const diagonal = diagonalRelative + diagonalReverseBase;
        if (diagonal === diagonalMin || diagonal < diagonalMax && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1]) {
          originalIndex = reversePoints[diagonal + 1] - 1;
          modifiedIndex = originalIndex - diagonalRelative - diagonalReverseOffset;
          if (originalIndex > lastOriginalIndex) {
            changeHelper.MarkNextChange();
          }
          lastOriginalIndex = originalIndex + 1;
          changeHelper.AddOriginalElement(originalIndex + 1, modifiedIndex + 1);
          diagonalRelative = diagonal + 1 - diagonalReverseBase;
        } else {
          originalIndex = reversePoints[diagonal - 1];
          modifiedIndex = originalIndex - diagonalRelative - diagonalReverseOffset;
          if (originalIndex > lastOriginalIndex) {
            changeHelper.MarkNextChange();
          }
          lastOriginalIndex = originalIndex;
          changeHelper.AddModifiedElement(originalIndex + 1, modifiedIndex + 1);
          diagonalRelative = diagonal - 1 - diagonalReverseBase;
        }
        if (historyIndex >= 0) {
          reversePoints = this.m_reverseHistory[historyIndex];
          diagonalReverseBase = reversePoints[0];
          diagonalMin = 1;
          diagonalMax = reversePoints.length - 1;
        }
      } while (--historyIndex >= -1);
      reverseChanges = changeHelper.getChanges();
    }
    return this.ConcatenateChanges(forwardChanges, reverseChanges);
  }
  /**
   * Given the range to compute the diff on, this method finds the point:
   * (midOriginal, midModified)
   * that exists in the middle of the LCS of the two sequences and
   * is the point at which the LCS problem may be broken down recursively.
   * This method will try to keep the LCS trace in memory. If the LCS recursion
   * point is calculated and the full trace is available in memory, then this method
   * will return the change list.
   * @param originalStart The start bound of the original sequence range
   * @param originalEnd The end bound of the original sequence range
   * @param modifiedStart The start bound of the modified sequence range
   * @param modifiedEnd The end bound of the modified sequence range
   * @param midOriginal The middle point of the original sequence range
   * @param midModified The middle point of the modified sequence range
   * @returns The diff changes, if available, otherwise null
   */
  ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr) {
    let originalIndex = 0, modifiedIndex = 0;
    let diagonalForwardStart = 0, diagonalForwardEnd = 0;
    let diagonalReverseStart = 0, diagonalReverseEnd = 0;
    originalStart--;
    modifiedStart--;
    midOriginalArr[0] = 0;
    midModifiedArr[0] = 0;
    this.m_forwardHistory = [];
    this.m_reverseHistory = [];
    const maxDifferences = originalEnd - originalStart + (modifiedEnd - modifiedStart);
    const numDiagonals = maxDifferences + 1;
    const forwardPoints = new Int32Array(numDiagonals);
    const reversePoints = new Int32Array(numDiagonals);
    const diagonalForwardBase = modifiedEnd - modifiedStart;
    const diagonalReverseBase = originalEnd - originalStart;
    const diagonalForwardOffset = originalStart - modifiedStart;
    const diagonalReverseOffset = originalEnd - modifiedEnd;
    const delta = diagonalReverseBase - diagonalForwardBase;
    const deltaIsEven = delta % 2 === 0;
    forwardPoints[diagonalForwardBase] = originalStart;
    reversePoints[diagonalReverseBase] = originalEnd;
    quitEarlyArr[0] = false;
    for (let numDifferences = 1; numDifferences <= maxDifferences / 2 + 1; numDifferences++) {
      let furthestOriginalIndex = 0;
      let furthestModifiedIndex = 0;
      diagonalForwardStart = this.ClipDiagonalBound(diagonalForwardBase - numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
      diagonalForwardEnd = this.ClipDiagonalBound(diagonalForwardBase + numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
      for (let diagonal = diagonalForwardStart; diagonal <= diagonalForwardEnd; diagonal += 2) {
        if (diagonal === diagonalForwardStart || diagonal < diagonalForwardEnd && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1]) {
          originalIndex = forwardPoints[diagonal + 1];
        } else {
          originalIndex = forwardPoints[diagonal - 1] + 1;
        }
        modifiedIndex = originalIndex - (diagonal - diagonalForwardBase) - diagonalForwardOffset;
        const tempOriginalIndex = originalIndex;
        while (originalIndex < originalEnd && modifiedIndex < modifiedEnd && this.ElementsAreEqual(originalIndex + 1, modifiedIndex + 1)) {
          originalIndex++;
          modifiedIndex++;
        }
        forwardPoints[diagonal] = originalIndex;
        if (originalIndex + modifiedIndex > furthestOriginalIndex + furthestModifiedIndex) {
          furthestOriginalIndex = originalIndex;
          furthestModifiedIndex = modifiedIndex;
        }
        if (!deltaIsEven && Math.abs(diagonal - diagonalReverseBase) <= numDifferences - 1) {
          if (originalIndex >= reversePoints[diagonal]) {
            midOriginalArr[0] = originalIndex;
            midModifiedArr[0] = modifiedIndex;
            if (tempOriginalIndex <= reversePoints[diagonal] && 1447 /* MaxDifferencesHistory */ > 0 && numDifferences <= 1447 /* MaxDifferencesHistory */ + 1) {
              return this.WALKTRACE(
                diagonalForwardBase,
                diagonalForwardStart,
                diagonalForwardEnd,
                diagonalForwardOffset,
                diagonalReverseBase,
                diagonalReverseStart,
                diagonalReverseEnd,
                diagonalReverseOffset,
                forwardPoints,
                reversePoints,
                originalIndex,
                originalEnd,
                midOriginalArr,
                modifiedIndex,
                modifiedEnd,
                midModifiedArr,
                deltaIsEven,
                quitEarlyArr
              );
            } else {
              return null;
            }
          }
        }
      }
      const matchLengthOfLongest = (furthestOriginalIndex - originalStart + (furthestModifiedIndex - modifiedStart) - numDifferences) / 2;
      if (this.ContinueProcessingPredicate !== null && !this.ContinueProcessingPredicate(furthestOriginalIndex, matchLengthOfLongest)) {
        quitEarlyArr[0] = true;
        midOriginalArr[0] = furthestOriginalIndex;
        midModifiedArr[0] = furthestModifiedIndex;
        if (matchLengthOfLongest > 0 && 1447 /* MaxDifferencesHistory */ > 0 && numDifferences <= 1447 /* MaxDifferencesHistory */ + 1) {
          return this.WALKTRACE(
            diagonalForwardBase,
            diagonalForwardStart,
            diagonalForwardEnd,
            diagonalForwardOffset,
            diagonalReverseBase,
            diagonalReverseStart,
            diagonalReverseEnd,
            diagonalReverseOffset,
            forwardPoints,
            reversePoints,
            originalIndex,
            originalEnd,
            midOriginalArr,
            modifiedIndex,
            modifiedEnd,
            midModifiedArr,
            deltaIsEven,
            quitEarlyArr
          );
        } else {
          originalStart++;
          modifiedStart++;
          return [
            new DiffChange(
              originalStart,
              originalEnd - originalStart + 1,
              modifiedStart,
              modifiedEnd - modifiedStart + 1
            )
          ];
        }
      }
      diagonalReverseStart = this.ClipDiagonalBound(diagonalReverseBase - numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
      diagonalReverseEnd = this.ClipDiagonalBound(diagonalReverseBase + numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
      for (let diagonal = diagonalReverseStart; diagonal <= diagonalReverseEnd; diagonal += 2) {
        if (diagonal === diagonalReverseStart || diagonal < diagonalReverseEnd && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1]) {
          originalIndex = reversePoints[diagonal + 1] - 1;
        } else {
          originalIndex = reversePoints[diagonal - 1];
        }
        modifiedIndex = originalIndex - (diagonal - diagonalReverseBase) - diagonalReverseOffset;
        const tempOriginalIndex = originalIndex;
        while (originalIndex > originalStart && modifiedIndex > modifiedStart && this.ElementsAreEqual(originalIndex, modifiedIndex)) {
          originalIndex--;
          modifiedIndex--;
        }
        reversePoints[diagonal] = originalIndex;
        if (deltaIsEven && Math.abs(diagonal - diagonalForwardBase) <= numDifferences) {
          if (originalIndex <= forwardPoints[diagonal]) {
            midOriginalArr[0] = originalIndex;
            midModifiedArr[0] = modifiedIndex;
            if (tempOriginalIndex >= forwardPoints[diagonal] && 1447 /* MaxDifferencesHistory */ > 0 && numDifferences <= 1447 /* MaxDifferencesHistory */ + 1) {
              return this.WALKTRACE(
                diagonalForwardBase,
                diagonalForwardStart,
                diagonalForwardEnd,
                diagonalForwardOffset,
                diagonalReverseBase,
                diagonalReverseStart,
                diagonalReverseEnd,
                diagonalReverseOffset,
                forwardPoints,
                reversePoints,
                originalIndex,
                originalEnd,
                midOriginalArr,
                modifiedIndex,
                modifiedEnd,
                midModifiedArr,
                deltaIsEven,
                quitEarlyArr
              );
            } else {
              return null;
            }
          }
        }
      }
      if (numDifferences <= 1447 /* MaxDifferencesHistory */) {
        let temp = new Int32Array(diagonalForwardEnd - diagonalForwardStart + 2);
        temp[0] = diagonalForwardBase - diagonalForwardStart + 1;
        MyArray.Copy2(forwardPoints, diagonalForwardStart, temp, 1, diagonalForwardEnd - diagonalForwardStart + 1);
        this.m_forwardHistory.push(temp);
        temp = new Int32Array(diagonalReverseEnd - diagonalReverseStart + 2);
        temp[0] = diagonalReverseBase - diagonalReverseStart + 1;
        MyArray.Copy2(reversePoints, diagonalReverseStart, temp, 1, diagonalReverseEnd - diagonalReverseStart + 1);
        this.m_reverseHistory.push(temp);
      }
    }
    return this.WALKTRACE(
      diagonalForwardBase,
      diagonalForwardStart,
      diagonalForwardEnd,
      diagonalForwardOffset,
      diagonalReverseBase,
      diagonalReverseStart,
      diagonalReverseEnd,
      diagonalReverseOffset,
      forwardPoints,
      reversePoints,
      originalIndex,
      originalEnd,
      midOriginalArr,
      modifiedIndex,
      modifiedEnd,
      midModifiedArr,
      deltaIsEven,
      quitEarlyArr
    );
  }
  /**
   * Shifts the given changes to provide a more intuitive diff.
   * While the first element in a diff matches the first element after the diff,
   * we shift the diff down.
   *
   * @param changes The list of changes to shift
   * @returns The shifted changes
   */
  PrettifyChanges(changes) {
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const originalStop = i < changes.length - 1 ? changes[i + 1].originalStart : this._originalElementsOrHash.length;
      const modifiedStop = i < changes.length - 1 ? changes[i + 1].modifiedStart : this._modifiedElementsOrHash.length;
      const checkOriginal = change.originalLength > 0;
      const checkModified = change.modifiedLength > 0;
      while (change.originalStart + change.originalLength < originalStop && change.modifiedStart + change.modifiedLength < modifiedStop && (!checkOriginal || this.OriginalElementsAreEqual(change.originalStart, change.originalStart + change.originalLength)) && (!checkModified || this.ModifiedElementsAreEqual(change.modifiedStart, change.modifiedStart + change.modifiedLength))) {
        const startStrictEqual = this.ElementsAreStrictEqual(change.originalStart, change.modifiedStart);
        const endStrictEqual = this.ElementsAreStrictEqual(change.originalStart + change.originalLength, change.modifiedStart + change.modifiedLength);
        if (endStrictEqual && !startStrictEqual) {
          break;
        }
        change.originalStart++;
        change.modifiedStart++;
      }
      const mergedChangeArr = [null];
      if (i < changes.length - 1 && this.ChangesOverlap(changes[i], changes[i + 1], mergedChangeArr)) {
        changes[i] = mergedChangeArr[0];
        changes.splice(i + 1, 1);
        i--;
        continue;
      }
    }
    for (let i = changes.length - 1; i >= 0; i--) {
      const change = changes[i];
      let originalStop = 0;
      let modifiedStop = 0;
      if (i > 0) {
        const prevChange = changes[i - 1];
        originalStop = prevChange.originalStart + prevChange.originalLength;
        modifiedStop = prevChange.modifiedStart + prevChange.modifiedLength;
      }
      const checkOriginal = change.originalLength > 0;
      const checkModified = change.modifiedLength > 0;
      let bestDelta = 0;
      let bestScore = this._boundaryScore(change.originalStart, change.originalLength, change.modifiedStart, change.modifiedLength);
      for (let delta = 1; ; delta++) {
        const originalStart = change.originalStart - delta;
        const modifiedStart = change.modifiedStart - delta;
        if (originalStart < originalStop || modifiedStart < modifiedStop) {
          break;
        }
        if (checkOriginal && !this.OriginalElementsAreEqual(originalStart, originalStart + change.originalLength)) {
          break;
        }
        if (checkModified && !this.ModifiedElementsAreEqual(modifiedStart, modifiedStart + change.modifiedLength)) {
          break;
        }
        const touchingPreviousChange = originalStart === originalStop && modifiedStart === modifiedStop;
        const score = (touchingPreviousChange ? 5 : 0) + this._boundaryScore(originalStart, change.originalLength, modifiedStart, change.modifiedLength);
        if (score > bestScore) {
          bestScore = score;
          bestDelta = delta;
        }
      }
      change.originalStart -= bestDelta;
      change.modifiedStart -= bestDelta;
      const mergedChangeArr = [null];
      if (i > 0 && this.ChangesOverlap(changes[i - 1], changes[i], mergedChangeArr)) {
        changes[i - 1] = mergedChangeArr[0];
        changes.splice(i, 1);
        i++;
        continue;
      }
    }
    if (this._hasStrings) {
      for (let i = 1, len = changes.length; i < len; i++) {
        const aChange = changes[i - 1];
        const bChange = changes[i];
        const matchedLength = bChange.originalStart - aChange.originalStart - aChange.originalLength;
        const aOriginalStart = aChange.originalStart;
        const bOriginalEnd = bChange.originalStart + bChange.originalLength;
        const abOriginalLength = bOriginalEnd - aOriginalStart;
        const aModifiedStart = aChange.modifiedStart;
        const bModifiedEnd = bChange.modifiedStart + bChange.modifiedLength;
        const abModifiedLength = bModifiedEnd - aModifiedStart;
        if (matchedLength < 5 && abOriginalLength < 20 && abModifiedLength < 20) {
          const t = this._findBetterContiguousSequence(
            aOriginalStart,
            abOriginalLength,
            aModifiedStart,
            abModifiedLength,
            matchedLength
          );
          if (t) {
            const [originalMatchStart, modifiedMatchStart] = t;
            if (originalMatchStart !== aChange.originalStart + aChange.originalLength || modifiedMatchStart !== aChange.modifiedStart + aChange.modifiedLength) {
              aChange.originalLength = originalMatchStart - aChange.originalStart;
              aChange.modifiedLength = modifiedMatchStart - aChange.modifiedStart;
              bChange.originalStart = originalMatchStart + matchedLength;
              bChange.modifiedStart = modifiedMatchStart + matchedLength;
              bChange.originalLength = bOriginalEnd - bChange.originalStart;
              bChange.modifiedLength = bModifiedEnd - bChange.modifiedStart;
            }
          }
        }
      }
    }
    return changes;
  }
  _findBetterContiguousSequence(originalStart, originalLength, modifiedStart, modifiedLength, desiredLength) {
    if (originalLength < desiredLength || modifiedLength < desiredLength) {
      return null;
    }
    const originalMax = originalStart + originalLength - desiredLength + 1;
    const modifiedMax = modifiedStart + modifiedLength - desiredLength + 1;
    let bestScore = 0;
    let bestOriginalStart = 0;
    let bestModifiedStart = 0;
    for (let i = originalStart; i < originalMax; i++) {
      for (let j = modifiedStart; j < modifiedMax; j++) {
        const score = this._contiguousSequenceScore(i, j, desiredLength);
        if (score > 0 && score > bestScore) {
          bestScore = score;
          bestOriginalStart = i;
          bestModifiedStart = j;
        }
      }
    }
    if (bestScore > 0) {
      return [bestOriginalStart, bestModifiedStart];
    }
    return null;
  }
  _contiguousSequenceScore(originalStart, modifiedStart, length) {
    let score = 0;
    for (let l = 0; l < length; l++) {
      if (!this.ElementsAreEqual(originalStart + l, modifiedStart + l)) {
        return 0;
      }
      score += this._originalStringElements[originalStart + l].length;
    }
    return score;
  }
  _OriginalIsBoundary(index) {
    if (index <= 0 || index >= this._originalElementsOrHash.length - 1) {
      return true;
    }
    return this._hasStrings && /^\s*$/.test(this._originalStringElements[index]);
  }
  _OriginalRegionIsBoundary(originalStart, originalLength) {
    if (this._OriginalIsBoundary(originalStart) || this._OriginalIsBoundary(originalStart - 1)) {
      return true;
    }
    if (originalLength > 0) {
      const originalEnd = originalStart + originalLength;
      if (this._OriginalIsBoundary(originalEnd - 1) || this._OriginalIsBoundary(originalEnd)) {
        return true;
      }
    }
    return false;
  }
  _ModifiedIsBoundary(index) {
    if (index <= 0 || index >= this._modifiedElementsOrHash.length - 1) {
      return true;
    }
    return this._hasStrings && /^\s*$/.test(this._modifiedStringElements[index]);
  }
  _ModifiedRegionIsBoundary(modifiedStart, modifiedLength) {
    if (this._ModifiedIsBoundary(modifiedStart) || this._ModifiedIsBoundary(modifiedStart - 1)) {
      return true;
    }
    if (modifiedLength > 0) {
      const modifiedEnd = modifiedStart + modifiedLength;
      if (this._ModifiedIsBoundary(modifiedEnd - 1) || this._ModifiedIsBoundary(modifiedEnd)) {
        return true;
      }
    }
    return false;
  }
  _boundaryScore(originalStart, originalLength, modifiedStart, modifiedLength) {
    const originalScore = this._OriginalRegionIsBoundary(originalStart, originalLength) ? 1 : 0;
    const modifiedScore = this._ModifiedRegionIsBoundary(modifiedStart, modifiedLength) ? 1 : 0;
    return originalScore + modifiedScore;
  }
  /**
   * Concatenates the two input DiffChange lists and returns the resulting
   * list.
   * @param The left changes
   * @param The right changes
   * @returns The concatenated list
   */
  ConcatenateChanges(left, right) {
    const mergedChangeArr = [];
    if (left.length === 0 || right.length === 0) {
      return right.length > 0 ? right : left;
    } else if (this.ChangesOverlap(left[left.length - 1], right[0], mergedChangeArr)) {
      const result = new Array(left.length + right.length - 1);
      MyArray.Copy(left, 0, result, 0, left.length - 1);
      result[left.length - 1] = mergedChangeArr[0];
      MyArray.Copy(right, 1, result, left.length, right.length - 1);
      return result;
    } else {
      const result = new Array(left.length + right.length);
      MyArray.Copy(left, 0, result, 0, left.length);
      MyArray.Copy(right, 0, result, left.length, right.length);
      return result;
    }
  }
  /**
   * Returns true if the two changes overlap and can be merged into a single
   * change
   * @param left The left change
   * @param right The right change
   * @param mergedChange The merged change if the two overlap, null otherwise
   * @returns True if the two changes overlap
   */
  ChangesOverlap(left, right, mergedChangeArr) {
    Debug.Assert(left.originalStart <= right.originalStart, "Left change is not less than or equal to right change");
    Debug.Assert(left.modifiedStart <= right.modifiedStart, "Left change is not less than or equal to right change");
    if (left.originalStart + left.originalLength >= right.originalStart || left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
      const originalStart = left.originalStart;
      let originalLength = left.originalLength;
      const modifiedStart = left.modifiedStart;
      let modifiedLength = left.modifiedLength;
      if (left.originalStart + left.originalLength >= right.originalStart) {
        originalLength = right.originalStart + right.originalLength - left.originalStart;
      }
      if (left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
        modifiedLength = right.modifiedStart + right.modifiedLength - left.modifiedStart;
      }
      mergedChangeArr[0] = new DiffChange(originalStart, originalLength, modifiedStart, modifiedLength);
      return true;
    } else {
      mergedChangeArr[0] = null;
      return false;
    }
  }
  /**
   * Helper method used to clip a diagonal index to the range of valid
   * diagonals. This also decides whether or not the diagonal index,
   * if it exceeds the boundary, should be clipped to the boundary or clipped
   * one inside the boundary depending on the Even/Odd status of the boundary
   * and numDifferences.
   * @param diagonal The index of the diagonal to clip.
   * @param numDifferences The current number of differences being iterated upon.
   * @param diagonalBaseIndex The base reference diagonal.
   * @param numDiagonals The total number of diagonals.
   * @returns The clipped diagonal index.
   */
  ClipDiagonalBound(diagonal, numDifferences, diagonalBaseIndex, numDiagonals) {
    if (diagonal >= 0 && diagonal < numDiagonals) {
      return diagonal;
    }
    const diagonalsBelow = diagonalBaseIndex;
    const diagonalsAbove = numDiagonals - diagonalBaseIndex - 1;
    const diffEven = numDifferences % 2 === 0;
    if (diagonal < 0) {
      const lowerBoundEven = diagonalsBelow % 2 === 0;
      return diffEven === lowerBoundEven ? 0 : 1;
    } else {
      const upperBoundEven = diagonalsAbove % 2 === 0;
      return diffEven === upperBoundEven ? numDiagonals - 1 : numDiagonals - 2;
    }
  }
}
const precomputedEqualityArray = new Uint32Array(65536);
const computeLevenshteinDistanceForShortStrings = (firstString, secondString) => {
  const firstStringLength = firstString.length;
  const secondStringLength = secondString.length;
  const lastBitMask = 1 << firstStringLength - 1;
  let positiveVector = -1;
  let negativeVector = 0;
  let distance = firstStringLength;
  let index = firstStringLength;
  while (index--) {
    precomputedEqualityArray[firstString.charCodeAt(index)] |= 1 << index;
  }
  for (index = 0; index < secondStringLength; index++) {
    let equalityMask = precomputedEqualityArray[secondString.charCodeAt(index)];
    const combinedVector = equalityMask | negativeVector;
    equalityMask |= (equalityMask & positiveVector) + positiveVector ^ positiveVector;
    negativeVector |= ~(equalityMask | positiveVector);
    positiveVector &= equalityMask;
    if (negativeVector & lastBitMask) {
      distance++;
    }
    if (positiveVector & lastBitMask) {
      distance--;
    }
    negativeVector = negativeVector << 1 | 1;
    positiveVector = positiveVector << 1 | ~(combinedVector | negativeVector);
    negativeVector &= combinedVector;
  }
  index = firstStringLength;
  while (index--) {
    precomputedEqualityArray[firstString.charCodeAt(index)] = 0;
  }
  return distance;
};
function computeLevenshteinDistanceForLongStrings(firstString, secondString) {
  const firstStringLength = firstString.length;
  const secondStringLength = secondString.length;
  const horizontalBitArray = [];
  const verticalBitArray = [];
  const horizontalSize = Math.ceil(firstStringLength / 32);
  const verticalSize = Math.ceil(secondStringLength / 32);
  for (let i = 0; i < horizontalSize; i++) {
    horizontalBitArray[i] = -1;
    verticalBitArray[i] = 0;
  }
  let verticalIndex = 0;
  for (; verticalIndex < verticalSize - 1; verticalIndex++) {
    let negativeVector2 = 0;
    let positiveVector2 = -1;
    const start2 = verticalIndex * 32;
    const verticalLength2 = Math.min(32, secondStringLength) + start2;
    for (let k = start2; k < verticalLength2; k++) {
      precomputedEqualityArray[secondString.charCodeAt(k)] |= 1 << k;
    }
    for (let i = 0; i < firstStringLength; i++) {
      const equalityMask = precomputedEqualityArray[firstString.charCodeAt(i)];
      const previousBit = horizontalBitArray[i / 32 | 0] >>> i & 1;
      const matchBit = verticalBitArray[i / 32 | 0] >>> i & 1;
      const combinedVector = equalityMask | negativeVector2;
      const combinedHorizontalVector = ((equalityMask | matchBit) & positiveVector2) + positiveVector2 ^ positiveVector2 | equalityMask | matchBit;
      let positiveHorizontalVector = negativeVector2 | ~(combinedHorizontalVector | positiveVector2);
      let negativeHorizontalVector = positiveVector2 & combinedHorizontalVector;
      if (positiveHorizontalVector >>> 31 ^ previousBit) {
        horizontalBitArray[i / 32 | 0] ^= 1 << i;
      }
      if (negativeHorizontalVector >>> 31 ^ matchBit) {
        verticalBitArray[i / 32 | 0] ^= 1 << i;
      }
      positiveHorizontalVector = positiveHorizontalVector << 1 | previousBit;
      negativeHorizontalVector = negativeHorizontalVector << 1 | matchBit;
      positiveVector2 = negativeHorizontalVector | ~(combinedVector | positiveHorizontalVector);
      negativeVector2 = positiveHorizontalVector & combinedVector;
    }
    for (let k = start2; k < verticalLength2; k++) {
      precomputedEqualityArray[secondString.charCodeAt(k)] = 0;
    }
  }
  let negativeVector = 0;
  let positiveVector = -1;
  const start = verticalIndex * 32;
  const verticalLength = Math.min(32, secondStringLength - start) + start;
  for (let k = start; k < verticalLength; k++) {
    precomputedEqualityArray[secondString.charCodeAt(k)] |= 1 << k;
  }
  let distance = secondStringLength;
  for (let i = 0; i < firstStringLength; i++) {
    const equalityMask = precomputedEqualityArray[firstString.charCodeAt(i)];
    const previousBit = horizontalBitArray[i / 32 | 0] >>> i & 1;
    const matchBit = verticalBitArray[i / 32 | 0] >>> i & 1;
    const combinedVector = equalityMask | negativeVector;
    const combinedHorizontalVector = ((equalityMask | matchBit) & positiveVector) + positiveVector ^ positiveVector | equalityMask | matchBit;
    let positiveHorizontalVector = negativeVector | ~(combinedHorizontalVector | positiveVector);
    let negativeHorizontalVector = positiveVector & combinedHorizontalVector;
    distance += positiveHorizontalVector >>> secondStringLength - 1 & 1;
    distance -= negativeHorizontalVector >>> secondStringLength - 1 & 1;
    if (positiveHorizontalVector >>> 31 ^ previousBit) {
      horizontalBitArray[i / 32 | 0] ^= 1 << i;
    }
    if (negativeHorizontalVector >>> 31 ^ matchBit) {
      verticalBitArray[i / 32 | 0] ^= 1 << i;
    }
    positiveHorizontalVector = positiveHorizontalVector << 1 | previousBit;
    negativeHorizontalVector = negativeHorizontalVector << 1 | matchBit;
    positiveVector = negativeHorizontalVector | ~(combinedVector | positiveHorizontalVector);
    negativeVector = positiveHorizontalVector & combinedVector;
  }
  for (let k = start; k < verticalLength; k++) {
    precomputedEqualityArray[secondString.charCodeAt(k)] = 0;
  }
  return distance;
}
function computeLevenshteinDistance(firstString, secondString) {
  if (firstString.length < secondString.length) {
    const temp = secondString;
    secondString = firstString;
    firstString = temp;
  }
  if (secondString.length === 0) {
    return firstString.length;
  }
  if (firstString.length <= 32) {
    return computeLevenshteinDistanceForShortStrings(firstString, secondString);
  }
  return computeLevenshteinDistanceForLongStrings(firstString, secondString);
}
export {
  LcsDiff,
  StringDiffSequence,
  computeLevenshteinDistance,
  stringDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpZmZDaGFuZ2UgfSBmcm9tICcuL2RpZmZDaGFuZ2UuanMnO1xuaW1wb3J0IHsgc3RyaW5nSGFzaCB9IGZyb20gJy4uL2hhc2guanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vdWludC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdHJpbmdEaWZmU2VxdWVuY2UgaW1wbGVtZW50cyBJU2VxdWVuY2Uge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc291cmNlOiBzdHJpbmcpIHsgfVxuXG5cdGdldEVsZW1lbnRzKCk6IEludDMyQXJyYXkgfCBudW1iZXJbXSB8IHN0cmluZ1tdIHtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLnNvdXJjZTtcblx0XHRjb25zdCBjaGFyYWN0ZXJzID0gbmV3IEludDMyQXJyYXkoc291cmNlLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNvdXJjZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y2hhcmFjdGVyc1tpXSA9IHNvdXJjZS5jaGFyQ29kZUF0KGkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhcmFjdGVycztcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nRGlmZihvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nLCBwcmV0dHk6IGJvb2xlYW4pOiBJRGlmZkNoYW5nZVtdIHtcblx0cmV0dXJuIG5ldyBMY3NEaWZmKG5ldyBTdHJpbmdEaWZmU2VxdWVuY2Uob3JpZ2luYWwpLCBuZXcgU3RyaW5nRGlmZlNlcXVlbmNlKG1vZGlmaWVkKSkuQ29tcHV0ZURpZmYocHJldHR5KS5jaGFuZ2VzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXF1ZW5jZSB7XG5cdGdldEVsZW1lbnRzKCk6IEludDMyQXJyYXkgfCBudW1iZXJbXSB8IHN0cmluZ1tdO1xuXHRnZXRTdHJpY3RFbGVtZW50PyhpbmRleDogbnVtYmVyKTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmQ2hhbmdlIHtcblx0LyoqXG5cdCAqIFRoZSBwb3NpdGlvbiBvZiB0aGUgZmlyc3QgZWxlbWVudCBpbiB0aGUgb3JpZ2luYWwgc2VxdWVuY2Ugd2hpY2hcblx0ICogdGhpcyBjaGFuZ2UgYWZmZWN0cy5cblx0ICovXG5cdG9yaWdpbmFsU3RhcnQ6IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiBlbGVtZW50cyBmcm9tIHRoZSBvcmlnaW5hbCBzZXF1ZW5jZSB3aGljaCB3ZXJlXG5cdCAqIGFmZmVjdGVkLlxuXHQgKi9cblx0b3JpZ2luYWxMZW5ndGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBlbGVtZW50IGluIHRoZSBtb2RpZmllZCBzZXF1ZW5jZSB3aGljaFxuXHQgKiB0aGlzIGNoYW5nZSBhZmZlY3RzLlxuXHQgKi9cblx0bW9kaWZpZWRTdGFydDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIGVsZW1lbnRzIGZyb20gdGhlIG1vZGlmaWVkIHNlcXVlbmNlIHdoaWNoIHdlcmVcblx0ICogYWZmZWN0ZWQgKGFkZGVkKS5cblx0ICovXG5cdG1vZGlmaWVkTGVuZ3RoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZSB7XG5cdChmdXJ0aGVzdE9yaWdpbmFsSW5kZXg6IG51bWJlciwgbWF0Y2hMZW5ndGhPZkxvbmdlc3Q6IG51bWJlcik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpZmZSZXN1bHQge1xuXHRxdWl0RWFybHk6IGJvb2xlYW47XG5cdGNoYW5nZXM6IElEaWZmQ2hhbmdlW107XG59XG5cbi8vXG4vLyBUaGUgY29kZSBiZWxvdyBoYXMgYmVlbiBwb3J0ZWQgZnJvbSBhIEMjIGltcGxlbWVudGF0aW9uIGluIFZTXG4vL1xuXG5jbGFzcyBEZWJ1ZyB7XG5cblx0cHVibGljIHN0YXRpYyBBc3NlcnQoY29uZGl0aW9uOiBib29sZWFuLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIWNvbmRpdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBNeUFycmF5IHtcblx0LyoqXG5cdCAqIENvcGllcyBhIHJhbmdlIG9mIGVsZW1lbnRzIGZyb20gYW4gQXJyYXkgc3RhcnRpbmcgYXQgdGhlIHNwZWNpZmllZCBzb3VyY2UgaW5kZXggYW5kIHBhc3Rlc1xuXHQgKiB0aGVtIHRvIGFub3RoZXIgQXJyYXkgc3RhcnRpbmcgYXQgdGhlIHNwZWNpZmllZCBkZXN0aW5hdGlvbiBpbmRleC4gVGhlIGxlbmd0aCBhbmQgdGhlIGluZGV4ZXNcblx0ICogYXJlIHNwZWNpZmllZCBhcyA2NC1iaXQgaW50ZWdlcnMuXG5cdCAqIHNvdXJjZUFycmF5OlxuXHQgKlx0XHRUaGUgQXJyYXkgdGhhdCBjb250YWlucyB0aGUgZGF0YSB0byBjb3B5LlxuXHQgKiBzb3VyY2VJbmRleDpcblx0ICpcdFx0QSA2NC1iaXQgaW50ZWdlciB0aGF0IHJlcHJlc2VudHMgdGhlIGluZGV4IGluIHRoZSBzb3VyY2VBcnJheSBhdCB3aGljaCBjb3B5aW5nIGJlZ2lucy5cblx0ICogZGVzdGluYXRpb25BcnJheTpcblx0ICpcdFx0VGhlIEFycmF5IHRoYXQgcmVjZWl2ZXMgdGhlIGRhdGEuXG5cdCAqIGRlc3RpbmF0aW9uSW5kZXg6XG5cdCAqXHRcdEEgNjQtYml0IGludGVnZXIgdGhhdCByZXByZXNlbnRzIHRoZSBpbmRleCBpbiB0aGUgZGVzdGluYXRpb25BcnJheSBhdCB3aGljaCBzdG9yaW5nIGJlZ2lucy5cblx0ICogbGVuZ3RoOlxuXHQgKlx0XHRBIDY0LWJpdCBpbnRlZ2VyIHRoYXQgcmVwcmVzZW50cyB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIHRvIGNvcHkuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIENvcHkoc291cmNlQXJyYXk6IHVua25vd25bXSwgc291cmNlSW5kZXg6IG51bWJlciwgZGVzdGluYXRpb25BcnJheTogdW5rbm93bltdLCBkZXN0aW5hdGlvbkluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0ZGVzdGluYXRpb25BcnJheVtkZXN0aW5hdGlvbkluZGV4ICsgaV0gPSBzb3VyY2VBcnJheVtzb3VyY2VJbmRleCArIGldO1xuXHRcdH1cblx0fVxuXHRwdWJsaWMgc3RhdGljIENvcHkyKHNvdXJjZUFycmF5OiBJbnQzMkFycmF5LCBzb3VyY2VJbmRleDogbnVtYmVyLCBkZXN0aW5hdGlvbkFycmF5OiBJbnQzMkFycmF5LCBkZXN0aW5hdGlvbkluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0ZGVzdGluYXRpb25BcnJheVtkZXN0aW5hdGlvbkluZGV4ICsgaV0gPSBzb3VyY2VBcnJheVtzb3VyY2VJbmRleCArIGldO1xuXHRcdH1cblx0fVxufVxuXG4vLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4vLyBMY3NEaWZmLmNzXG4vL1xuLy8gQW4gaW1wbGVtZW50YXRpb24gb2YgdGhlIGRpZmZlcmVuY2UgYWxnb3JpdGhtIGRlc2NyaWJlZCBpblxuLy8gXCJBbiBPKE5EKSBEaWZmZXJlbmNlIEFsZ29yaXRobSBhbmQgaXRzIHZhcmlhdGlvbnNcIiBieSBFdWdlbmUgVy4gTXllcnNcbi8vXG4vLyBDb3B5cmlnaHQgKEMpIDIwMDggTWljcm9zb2Z0IENvcnBvcmF0aW9uIEBtaW5pZmllcl9kb19ub3RfcHJlc2VydmVcbi8vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcblxuLy8gT3VyIHRvdGFsIG1lbW9yeSB1c2FnZSBmb3Igc3RvcmluZyBoaXN0b3J5IGlzICh3b3JzdC1jYXNlKTpcbi8vIDIgKiBbKE1heERpZmZlcmVuY2VzSGlzdG9yeSArIDEpICogKE1heERpZmZlcmVuY2VzSGlzdG9yeSArIDEpIC0gMV0gKiBzaXplb2YoaW50KVxuLy8gMiAqIFsxNDQ4KjE0NDggLSAxXSAqIDQgPSAxNjc3MzYyNCA9IDE2TUJcbmNvbnN0IGVudW0gTG9jYWxDb25zdGFudHMge1xuXHRNYXhEaWZmZXJlbmNlc0hpc3RvcnkgPSAxNDQ3XG59XG5cbi8qKlxuICogQSB1dGlsaXR5IGNsYXNzIHdoaWNoIGhlbHBzIHRvIGNyZWF0ZSB0aGUgc2V0IG9mIERpZmZDaGFuZ2VzIGZyb21cbiAqIGEgZGlmZmVyZW5jZSBvcGVyYXRpb24uIFRoaXMgY2xhc3MgYWNjZXB0cyBvcmlnaW5hbCBEaWZmRWxlbWVudHMgYW5kXG4gKiBtb2RpZmllZCBEaWZmRWxlbWVudHMgdGhhdCBhcmUgaW52b2x2ZWQgaW4gYSBwYXJ0aWN1bGFyIGNoYW5nZS4gVGhlXG4gKiBNYXJrTmV4dENoYW5nZSgpIG1ldGhvZCBjYW4gYmUgY2FsbGVkIHRvIG1hcmsgdGhlIHNlcGFyYXRpb24gYmV0d2VlblxuICogZGlzdGluY3QgY2hhbmdlcy4gQXQgdGhlIGVuZCwgdGhlIENoYW5nZXMgcHJvcGVydHkgY2FuIGJlIGNhbGxlZCB0byByZXRyaWV2ZVxuICogdGhlIGNvbnN0cnVjdGVkIGNoYW5nZXMuXG4gKi9cbmNsYXNzIERpZmZDaGFuZ2VIZWxwZXIge1xuXG5cdHByaXZhdGUgbV9jaGFuZ2VzOiBEaWZmQ2hhbmdlW107XG5cdHByaXZhdGUgbV9vcmlnaW5hbFN0YXJ0OiBudW1iZXI7XG5cdHByaXZhdGUgbV9tb2RpZmllZFN0YXJ0OiBudW1iZXI7XG5cdHByaXZhdGUgbV9vcmlnaW5hbENvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgbV9tb2RpZmllZENvdW50OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIENvbnN0cnVjdHMgYSBuZXcgRGlmZkNoYW5nZUhlbHBlciBmb3IgdGhlIGdpdmVuIERpZmZTZXF1ZW5jZXMuXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLm1fY2hhbmdlcyA9IFtdO1xuXHRcdHRoaXMubV9vcmlnaW5hbFN0YXJ0ID0gQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVI7XG5cdFx0dGhpcy5tX21vZGlmaWVkU3RhcnQgPSBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUjtcblx0XHR0aGlzLm1fb3JpZ2luYWxDb3VudCA9IDA7XG5cdFx0dGhpcy5tX21vZGlmaWVkQ291bnQgPSAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSBiZWdpbm5pbmcgb2YgdGhlIG5leHQgY2hhbmdlIGluIHRoZSBzZXQgb2YgZGlmZmVyZW5jZXMuXG5cdCAqL1xuXHRwdWJsaWMgTWFya05leHRDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Ly8gT25seSBhZGQgdG8gdGhlIGxpc3QgaWYgdGhlcmUgaXMgc29tZXRoaW5nIHRvIGFkZFxuXHRcdGlmICh0aGlzLm1fb3JpZ2luYWxDb3VudCA+IDAgfHwgdGhpcy5tX21vZGlmaWVkQ291bnQgPiAwKSB7XG5cdFx0XHQvLyBBZGQgdGhlIG5ldyBjaGFuZ2UgdG8gb3VyIGxpc3Rcblx0XHRcdHRoaXMubV9jaGFuZ2VzLnB1c2gobmV3IERpZmZDaGFuZ2UodGhpcy5tX29yaWdpbmFsU3RhcnQsIHRoaXMubV9vcmlnaW5hbENvdW50LFxuXHRcdFx0XHR0aGlzLm1fbW9kaWZpZWRTdGFydCwgdGhpcy5tX21vZGlmaWVkQ291bnQpKTtcblx0XHR9XG5cblx0XHQvLyBSZXNldCBmb3IgdGhlIG5leHQgY2hhbmdlXG5cdFx0dGhpcy5tX29yaWdpbmFsQ291bnQgPSAwO1xuXHRcdHRoaXMubV9tb2RpZmllZENvdW50ID0gMDtcblx0XHR0aGlzLm1fb3JpZ2luYWxTdGFydCA9IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSO1xuXHRcdHRoaXMubV9tb2RpZmllZFN0YXJ0ID0gQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVI7XG5cdH1cblxuXHQvKipcblx0ICogQWRkcyB0aGUgb3JpZ2luYWwgZWxlbWVudCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gdG8gdGhlIGVsZW1lbnRzXG5cdCAqIGFmZmVjdGVkIGJ5IHRoZSBjdXJyZW50IGNoYW5nZS4gVGhlIG1vZGlmaWVkIGluZGV4IGdpdmVzIGNvbnRleHRcblx0ICogdG8gdGhlIGNoYW5nZSBwb3NpdGlvbiB3aXRoIHJlc3BlY3QgdG8gdGhlIG9yaWdpbmFsIHNlcXVlbmNlLlxuXHQgKiBAcGFyYW0gb3JpZ2luYWxJbmRleCBUaGUgaW5kZXggb2YgdGhlIG9yaWdpbmFsIGVsZW1lbnQgdG8gYWRkLlxuXHQgKiBAcGFyYW0gbW9kaWZpZWRJbmRleCBUaGUgaW5kZXggb2YgdGhlIG1vZGlmaWVkIGVsZW1lbnQgdGhhdCBwcm92aWRlcyBjb3JyZXNwb25kaW5nIHBvc2l0aW9uIGluIHRoZSBtb2RpZmllZCBzZXF1ZW5jZS5cblx0ICovXG5cdHB1YmxpYyBBZGRPcmlnaW5hbEVsZW1lbnQob3JpZ2luYWxJbmRleDogbnVtYmVyLCBtb2RpZmllZEluZGV4OiBudW1iZXIpIHtcblx0XHQvLyBUaGUgJ3RydWUnIHN0YXJ0IGluZGV4IGlzIHRoZSBzbWFsbGVzdCBvZiB0aGUgb25lcyB3ZSd2ZSBzZWVuXG5cdFx0dGhpcy5tX29yaWdpbmFsU3RhcnQgPSBNYXRoLm1pbih0aGlzLm1fb3JpZ2luYWxTdGFydCwgb3JpZ2luYWxJbmRleCk7XG5cdFx0dGhpcy5tX21vZGlmaWVkU3RhcnQgPSBNYXRoLm1pbih0aGlzLm1fbW9kaWZpZWRTdGFydCwgbW9kaWZpZWRJbmRleCk7XG5cblx0XHR0aGlzLm1fb3JpZ2luYWxDb3VudCsrO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgdGhlIG1vZGlmaWVkIGVsZW1lbnQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHRvIHRoZSBlbGVtZW50c1xuXHQgKiBhZmZlY3RlZCBieSB0aGUgY3VycmVudCBjaGFuZ2UuIFRoZSBvcmlnaW5hbCBpbmRleCBnaXZlcyBjb250ZXh0XG5cdCAqIHRvIHRoZSBjaGFuZ2UgcG9zaXRpb24gd2l0aCByZXNwZWN0IHRvIHRoZSBtb2RpZmllZCBzZXF1ZW5jZS5cblx0ICogQHBhcmFtIG9yaWdpbmFsSW5kZXggVGhlIGluZGV4IG9mIHRoZSBvcmlnaW5hbCBlbGVtZW50IHRoYXQgcHJvdmlkZXMgY29ycmVzcG9uZGluZyBwb3NpdGlvbiBpbiB0aGUgb3JpZ2luYWwgc2VxdWVuY2UuXG5cdCAqIEBwYXJhbSBtb2RpZmllZEluZGV4IFRoZSBpbmRleCBvZiB0aGUgbW9kaWZpZWQgZWxlbWVudCB0byBhZGQuXG5cdCAqL1xuXHRwdWJsaWMgQWRkTW9kaWZpZWRFbGVtZW50KG9yaWdpbmFsSW5kZXg6IG51bWJlciwgbW9kaWZpZWRJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gVGhlICd0cnVlJyBzdGFydCBpbmRleCBpcyB0aGUgc21hbGxlc3Qgb2YgdGhlIG9uZXMgd2UndmUgc2VlblxuXHRcdHRoaXMubV9vcmlnaW5hbFN0YXJ0ID0gTWF0aC5taW4odGhpcy5tX29yaWdpbmFsU3RhcnQsIG9yaWdpbmFsSW5kZXgpO1xuXHRcdHRoaXMubV9tb2RpZmllZFN0YXJ0ID0gTWF0aC5taW4odGhpcy5tX21vZGlmaWVkU3RhcnQsIG1vZGlmaWVkSW5kZXgpO1xuXG5cdFx0dGhpcy5tX21vZGlmaWVkQ291bnQrKztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZXMgYWxsIG9mIHRoZSBjaGFuZ2VzIG1hcmtlZCBieSB0aGUgY2xhc3MuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Q2hhbmdlcygpOiBEaWZmQ2hhbmdlW10ge1xuXHRcdGlmICh0aGlzLm1fb3JpZ2luYWxDb3VudCA+IDAgfHwgdGhpcy5tX21vZGlmaWVkQ291bnQgPiAwKSB7XG5cdFx0XHQvLyBGaW5pc2ggdXAgb24gd2hhdGV2ZXIgaXMgbGVmdFxuXHRcdFx0dGhpcy5NYXJrTmV4dENoYW5nZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1fY2hhbmdlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZXMgYWxsIG9mIHRoZSBjaGFuZ2VzIG1hcmtlZCBieSB0aGUgY2xhc3MgaW4gdGhlIHJldmVyc2Ugb3JkZXJcblx0ICovXG5cdHB1YmxpYyBnZXRSZXZlcnNlQ2hhbmdlcygpOiBEaWZmQ2hhbmdlW10ge1xuXHRcdGlmICh0aGlzLm1fb3JpZ2luYWxDb3VudCA+IDAgfHwgdGhpcy5tX21vZGlmaWVkQ291bnQgPiAwKSB7XG5cdFx0XHQvLyBGaW5pc2ggdXAgb24gd2hhdGV2ZXIgaXMgbGVmdFxuXHRcdFx0dGhpcy5NYXJrTmV4dENoYW5nZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMubV9jaGFuZ2VzLnJldmVyc2UoKTtcblx0XHRyZXR1cm4gdGhpcy5tX2NoYW5nZXM7XG5cdH1cblxufVxuXG4vKipcbiAqIEFuIGltcGxlbWVudGF0aW9uIG9mIHRoZSBkaWZmZXJlbmNlIGFsZ29yaXRobSBkZXNjcmliZWQgaW5cbiAqIFwiQW4gTyhORCkgRGlmZmVyZW5jZSBBbGdvcml0aG0gYW5kIGl0cyB2YXJpYXRpb25zXCIgYnkgRXVnZW5lIFcuIE15ZXJzXG4gKi9cbmV4cG9ydCBjbGFzcyBMY3NEaWZmIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IENvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZTogSUNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZSB8IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxTZXF1ZW5jZTogSVNlcXVlbmNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFNlcXVlbmNlOiBJU2VxdWVuY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1N0cmluZ3M6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsU3RyaW5nRWxlbWVudHM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoOiBJbnQzMkFycmF5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFN0cmluZ0VsZW1lbnRzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRFbGVtZW50c09ySGFzaDogSW50MzJBcnJheTtcblxuXHRwcml2YXRlIG1fZm9yd2FyZEhpc3Rvcnk6IEludDMyQXJyYXlbXTtcblx0cHJpdmF0ZSBtX3JldmVyc2VIaXN0b3J5OiBJbnQzMkFycmF5W107XG5cblx0LyoqXG5cdCAqIENvbnN0cnVjdHMgdGhlIERpZmZGaW5kZXJcblx0ICovXG5cdGNvbnN0cnVjdG9yKG9yaWdpbmFsU2VxdWVuY2U6IElTZXF1ZW5jZSwgbW9kaWZpZWRTZXF1ZW5jZTogSVNlcXVlbmNlLCBjb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGU6IElDb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGUgfCBudWxsID0gbnVsbCkge1xuXHRcdHRoaXMuQ29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlID0gY29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlO1xuXG5cdFx0dGhpcy5fb3JpZ2luYWxTZXF1ZW5jZSA9IG9yaWdpbmFsU2VxdWVuY2U7XG5cdFx0dGhpcy5fbW9kaWZpZWRTZXF1ZW5jZSA9IG1vZGlmaWVkU2VxdWVuY2U7XG5cblx0XHRjb25zdCBbb3JpZ2luYWxTdHJpbmdFbGVtZW50cywgb3JpZ2luYWxFbGVtZW50c09ySGFzaCwgb3JpZ2luYWxIYXNTdHJpbmdzXSA9IExjc0RpZmYuX2dldEVsZW1lbnRzKG9yaWdpbmFsU2VxdWVuY2UpO1xuXHRcdGNvbnN0IFttb2RpZmllZFN0cmluZ0VsZW1lbnRzLCBtb2RpZmllZEVsZW1lbnRzT3JIYXNoLCBtb2RpZmllZEhhc1N0cmluZ3NdID0gTGNzRGlmZi5fZ2V0RWxlbWVudHMobW9kaWZpZWRTZXF1ZW5jZSk7XG5cblx0XHR0aGlzLl9oYXNTdHJpbmdzID0gKG9yaWdpbmFsSGFzU3RyaW5ncyAmJiBtb2RpZmllZEhhc1N0cmluZ3MpO1xuXHRcdHRoaXMuX29yaWdpbmFsU3RyaW5nRWxlbWVudHMgPSBvcmlnaW5hbFN0cmluZ0VsZW1lbnRzO1xuXHRcdHRoaXMuX29yaWdpbmFsRWxlbWVudHNPckhhc2ggPSBvcmlnaW5hbEVsZW1lbnRzT3JIYXNoO1xuXHRcdHRoaXMuX21vZGlmaWVkU3RyaW5nRWxlbWVudHMgPSBtb2RpZmllZFN0cmluZ0VsZW1lbnRzO1xuXHRcdHRoaXMuX21vZGlmaWVkRWxlbWVudHNPckhhc2ggPSBtb2RpZmllZEVsZW1lbnRzT3JIYXNoO1xuXG5cdFx0dGhpcy5tX2ZvcndhcmRIaXN0b3J5ID0gW107XG5cdFx0dGhpcy5tX3JldmVyc2VIaXN0b3J5ID0gW107XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNTdHJpbmdBcnJheShhcnI6IEludDMyQXJyYXkgfCBudW1iZXJbXSB8IHN0cmluZ1tdKTogYXJyIGlzIHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gKGFyci5sZW5ndGggPiAwICYmIHR5cGVvZiBhcnJbMF0gPT09ICdzdHJpbmcnKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRFbGVtZW50cyhzZXF1ZW5jZTogSVNlcXVlbmNlKTogW3N0cmluZ1tdLCBJbnQzMkFycmF5LCBib29sZWFuXSB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBzZXF1ZW5jZS5nZXRFbGVtZW50cygpO1xuXG5cdFx0aWYgKExjc0RpZmYuX2lzU3RyaW5nQXJyYXkoZWxlbWVudHMpKSB7XG5cdFx0XHRjb25zdCBoYXNoZXMgPSBuZXcgSW50MzJBcnJheShlbGVtZW50cy5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGVsZW1lbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGhhc2hlc1tpXSA9IHN0cmluZ0hhc2goZWxlbWVudHNbaV0sIDApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtlbGVtZW50cywgaGFzaGVzLCB0cnVlXTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudHMgaW5zdGFuY2VvZiBJbnQzMkFycmF5KSB7XG5cdFx0XHRyZXR1cm4gW1tdLCBlbGVtZW50cywgZmFsc2VdO1xuXHRcdH1cblxuXHRcdHJldHVybiBbW10sIG5ldyBJbnQzMkFycmF5KGVsZW1lbnRzKSwgZmFsc2VdO1xuXHR9XG5cblx0cHJpdmF0ZSBFbGVtZW50c0FyZUVxdWFsKG9yaWdpbmFsSW5kZXg6IG51bWJlciwgbmV3SW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoW29yaWdpbmFsSW5kZXhdICE9PSB0aGlzLl9tb2RpZmllZEVsZW1lbnRzT3JIYXNoW25ld0luZGV4XSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHRoaXMuX2hhc1N0cmluZ3MgPyB0aGlzLl9vcmlnaW5hbFN0cmluZ0VsZW1lbnRzW29yaWdpbmFsSW5kZXhdID09PSB0aGlzLl9tb2RpZmllZFN0cmluZ0VsZW1lbnRzW25ld0luZGV4XSA6IHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBFbGVtZW50c0FyZVN0cmljdEVxdWFsKG9yaWdpbmFsSW5kZXg6IG51bWJlciwgbmV3SW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5FbGVtZW50c0FyZUVxdWFsKG9yaWdpbmFsSW5kZXgsIG5ld0luZGV4KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBvcmlnaW5hbEVsZW1lbnQgPSBMY3NEaWZmLl9nZXRTdHJpY3RFbGVtZW50KHRoaXMuX29yaWdpbmFsU2VxdWVuY2UsIG9yaWdpbmFsSW5kZXgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkRWxlbWVudCA9IExjc0RpZmYuX2dldFN0cmljdEVsZW1lbnQodGhpcy5fbW9kaWZpZWRTZXF1ZW5jZSwgbmV3SW5kZXgpO1xuXHRcdHJldHVybiAob3JpZ2luYWxFbGVtZW50ID09PSBtb2RpZmllZEVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldFN0cmljdEVsZW1lbnQoc2VxdWVuY2U6IElTZXF1ZW5jZSwgaW5kZXg6IG51bWJlcik6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICh0eXBlb2Ygc2VxdWVuY2UuZ2V0U3RyaWN0RWxlbWVudCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHNlcXVlbmNlLmdldFN0cmljdEVsZW1lbnQoaW5kZXgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgT3JpZ2luYWxFbGVtZW50c0FyZUVxdWFsKGluZGV4MTogbnVtYmVyLCBpbmRleDI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoW2luZGV4MV0gIT09IHRoaXMuX29yaWdpbmFsRWxlbWVudHNPckhhc2hbaW5kZXgyXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHRoaXMuX2hhc1N0cmluZ3MgPyB0aGlzLl9vcmlnaW5hbFN0cmluZ0VsZW1lbnRzW2luZGV4MV0gPT09IHRoaXMuX29yaWdpbmFsU3RyaW5nRWxlbWVudHNbaW5kZXgyXSA6IHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBNb2RpZmllZEVsZW1lbnRzQXJlRXF1YWwoaW5kZXgxOiBudW1iZXIsIGluZGV4MjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGlmaWVkRWxlbWVudHNPckhhc2hbaW5kZXgxXSAhPT0gdGhpcy5fbW9kaWZpZWRFbGVtZW50c09ySGFzaFtpbmRleDJdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAodGhpcy5faGFzU3RyaW5ncyA/IHRoaXMuX21vZGlmaWVkU3RyaW5nRWxlbWVudHNbaW5kZXgxXSA9PT0gdGhpcy5fbW9kaWZpZWRTdHJpbmdFbGVtZW50c1tpbmRleDJdIDogdHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgQ29tcHV0ZURpZmYocHJldHR5OiBib29sZWFuKTogSURpZmZSZXN1bHQge1xuXHRcdHJldHVybiB0aGlzLl9Db21wdXRlRGlmZigwLCB0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoLmxlbmd0aCAtIDEsIDAsIHRoaXMuX21vZGlmaWVkRWxlbWVudHNPckhhc2gubGVuZ3RoIC0gMSwgcHJldHR5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiB0aGUgb3JpZ2luYWwgYW5kIG1vZGlmaWVkIGlucHV0XG5cdCAqIHNlcXVlbmNlcyBvbiB0aGUgYm91bmRlZCByYW5nZS5cblx0ICogQHJldHVybnMgQW4gYXJyYXkgb2YgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIHR3byBpbnB1dCBzZXF1ZW5jZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9Db21wdXRlRGlmZihvcmlnaW5hbFN0YXJ0OiBudW1iZXIsIG9yaWdpbmFsRW5kOiBudW1iZXIsIG1vZGlmaWVkU3RhcnQ6IG51bWJlciwgbW9kaWZpZWRFbmQ6IG51bWJlciwgcHJldHR5OiBib29sZWFuKTogSURpZmZSZXN1bHQge1xuXHRcdGNvbnN0IHF1aXRFYXJseUFyciA9IFtmYWxzZV07XG5cdFx0bGV0IGNoYW5nZXMgPSB0aGlzLkNvbXB1dGVEaWZmUmVjdXJzaXZlKG9yaWdpbmFsU3RhcnQsIG9yaWdpbmFsRW5kLCBtb2RpZmllZFN0YXJ0LCBtb2RpZmllZEVuZCwgcXVpdEVhcmx5QXJyKTtcblxuXHRcdGlmIChwcmV0dHkpIHtcblx0XHRcdC8vIFdlIGhhdmUgdG8gY2xlYW4gdXAgdGhlIGNvbXB1dGVkIGRpZmYgdG8gYmUgbW9yZSBpbnR1aXRpdmVcblx0XHRcdC8vIGJ1dCBpdCB0dXJucyBvdXQgdGhpcyBjYW5ub3QgYmUgZG9uZSBjb3JyZWN0bHkgdW50aWwgdGhlIGVudGlyZSBzZXRcblx0XHRcdC8vIG9mIGRpZmZzIGhhdmUgYmVlbiBjb21wdXRlZFxuXHRcdFx0Y2hhbmdlcyA9IHRoaXMuUHJldHRpZnlDaGFuZ2VzKGNoYW5nZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRxdWl0RWFybHk6IHF1aXRFYXJseUFyclswXSxcblx0XHRcdGNoYW5nZXM6IGNoYW5nZXNcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFByaXZhdGUgaGVscGVyIG1ldGhvZCB3aGljaCBjb21wdXRlcyB0aGUgZGlmZmVyZW5jZXMgb24gdGhlIGJvdW5kZWQgcmFuZ2Vcblx0ICogcmVjdXJzaXZlbHkuXG5cdCAqIEByZXR1cm5zIEFuIGFycmF5IG9mIHRoZSBkaWZmZXJlbmNlcyBiZXR3ZWVuIHRoZSB0d28gaW5wdXQgc2VxdWVuY2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBDb21wdXRlRGlmZlJlY3Vyc2l2ZShvcmlnaW5hbFN0YXJ0OiBudW1iZXIsIG9yaWdpbmFsRW5kOiBudW1iZXIsIG1vZGlmaWVkU3RhcnQ6IG51bWJlciwgbW9kaWZpZWRFbmQ6IG51bWJlciwgcXVpdEVhcmx5QXJyOiBib29sZWFuW10pOiBEaWZmQ2hhbmdlW10ge1xuXHRcdHF1aXRFYXJseUFyclswXSA9IGZhbHNlO1xuXG5cdFx0Ly8gRmluZCB0aGUgc3RhcnQgb2YgdGhlIGRpZmZlcmVuY2VzXG5cdFx0d2hpbGUgKG9yaWdpbmFsU3RhcnQgPD0gb3JpZ2luYWxFbmQgJiYgbW9kaWZpZWRTdGFydCA8PSBtb2RpZmllZEVuZCAmJiB0aGlzLkVsZW1lbnRzQXJlRXF1YWwob3JpZ2luYWxTdGFydCwgbW9kaWZpZWRTdGFydCkpIHtcblx0XHRcdG9yaWdpbmFsU3RhcnQrKztcblx0XHRcdG1vZGlmaWVkU3RhcnQrKztcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBlbmQgb2YgdGhlIGRpZmZlcmVuY2VzXG5cdFx0d2hpbGUgKG9yaWdpbmFsRW5kID49IG9yaWdpbmFsU3RhcnQgJiYgbW9kaWZpZWRFbmQgPj0gbW9kaWZpZWRTdGFydCAmJiB0aGlzLkVsZW1lbnRzQXJlRXF1YWwob3JpZ2luYWxFbmQsIG1vZGlmaWVkRW5kKSkge1xuXHRcdFx0b3JpZ2luYWxFbmQtLTtcblx0XHRcdG1vZGlmaWVkRW5kLS07XG5cdFx0fVxuXG5cdFx0Ly8gSW4gdGhlIHNwZWNpYWwgY2FzZSB3aGVyZSB3ZSBlaXRoZXIgaGF2ZSBhbGwgaW5zZXJ0aW9ucyBvciBhbGwgZGVsZXRpb25zIG9yIHRoZSBzZXF1ZW5jZXMgYXJlIGlkZW50aWNhbFxuXHRcdGlmIChvcmlnaW5hbFN0YXJ0ID4gb3JpZ2luYWxFbmQgfHwgbW9kaWZpZWRTdGFydCA+IG1vZGlmaWVkRW5kKSB7XG5cdFx0XHRsZXQgY2hhbmdlczogRGlmZkNoYW5nZVtdO1xuXG5cdFx0XHRpZiAobW9kaWZpZWRTdGFydCA8PSBtb2RpZmllZEVuZCkge1xuXHRcdFx0XHREZWJ1Zy5Bc3NlcnQob3JpZ2luYWxTdGFydCA9PT0gb3JpZ2luYWxFbmQgKyAxLCAnb3JpZ2luYWxTdGFydCBzaG91bGQgb25seSBiZSBvbmUgbW9yZSB0aGFuIG9yaWdpbmFsRW5kJyk7XG5cblx0XHRcdFx0Ly8gQWxsIGluc2VydGlvbnNcblx0XHRcdFx0Y2hhbmdlcyA9IFtcblx0XHRcdFx0XHRuZXcgRGlmZkNoYW5nZShvcmlnaW5hbFN0YXJ0LCAwLCBtb2RpZmllZFN0YXJ0LCBtb2RpZmllZEVuZCAtIG1vZGlmaWVkU3RhcnQgKyAxKVxuXHRcdFx0XHRdO1xuXHRcdFx0fSBlbHNlIGlmIChvcmlnaW5hbFN0YXJ0IDw9IG9yaWdpbmFsRW5kKSB7XG5cdFx0XHRcdERlYnVnLkFzc2VydChtb2RpZmllZFN0YXJ0ID09PSBtb2RpZmllZEVuZCArIDEsICdtb2RpZmllZFN0YXJ0IHNob3VsZCBvbmx5IGJlIG9uZSBtb3JlIHRoYW4gbW9kaWZpZWRFbmQnKTtcblxuXHRcdFx0XHQvLyBBbGwgZGVsZXRpb25zXG5cdFx0XHRcdGNoYW5nZXMgPSBbXG5cdFx0XHRcdFx0bmV3IERpZmZDaGFuZ2Uob3JpZ2luYWxTdGFydCwgb3JpZ2luYWxFbmQgLSBvcmlnaW5hbFN0YXJ0ICsgMSwgbW9kaWZpZWRTdGFydCwgMClcblx0XHRcdFx0XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdERlYnVnLkFzc2VydChvcmlnaW5hbFN0YXJ0ID09PSBvcmlnaW5hbEVuZCArIDEsICdvcmlnaW5hbFN0YXJ0IHNob3VsZCBvbmx5IGJlIG9uZSBtb3JlIHRoYW4gb3JpZ2luYWxFbmQnKTtcblx0XHRcdFx0RGVidWcuQXNzZXJ0KG1vZGlmaWVkU3RhcnQgPT09IG1vZGlmaWVkRW5kICsgMSwgJ21vZGlmaWVkU3RhcnQgc2hvdWxkIG9ubHkgYmUgb25lIG1vcmUgdGhhbiBtb2RpZmllZEVuZCcpO1xuXG5cdFx0XHRcdC8vIElkZW50aWNhbCBzZXF1ZW5jZXMgLSBObyBkaWZmZXJlbmNlc1xuXHRcdFx0XHRjaGFuZ2VzID0gW107XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGFuZ2VzO1xuXHRcdH1cblxuXHRcdC8vIFRoaXMgcHJvYmxlbSBjYW4gYmUgc29sdmVkIHVzaW5nIHRoZSBEaXZpZGUtQW5kLUNvbnF1ZXIgdGVjaG5pcXVlLlxuXHRcdGNvbnN0IG1pZE9yaWdpbmFsQXJyID0gWzBdO1xuXHRcdGNvbnN0IG1pZE1vZGlmaWVkQXJyID0gWzBdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuQ29tcHV0ZVJlY3Vyc2lvblBvaW50KG9yaWdpbmFsU3RhcnQsIG9yaWdpbmFsRW5kLCBtb2RpZmllZFN0YXJ0LCBtb2RpZmllZEVuZCwgbWlkT3JpZ2luYWxBcnIsIG1pZE1vZGlmaWVkQXJyLCBxdWl0RWFybHlBcnIpO1xuXG5cdFx0Y29uc3QgbWlkT3JpZ2luYWwgPSBtaWRPcmlnaW5hbEFyclswXTtcblx0XHRjb25zdCBtaWRNb2RpZmllZCA9IG1pZE1vZGlmaWVkQXJyWzBdO1xuXG5cdFx0aWYgKHJlc3VsdCAhPT0gbnVsbCkge1xuXHRcdFx0Ly8gUmVzdWx0IGlzIG5vdC1udWxsIHdoZW4gdGhlcmUgd2FzIGVub3VnaCBtZW1vcnkgdG8gY29tcHV0ZSB0aGUgY2hhbmdlcyB3aGlsZVxuXHRcdFx0Ly8gc2VhcmNoaW5nIGZvciB0aGUgcmVjdXJzaW9uIHBvaW50XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZWxzZSBpZiAoIXF1aXRFYXJseUFyclswXSkge1xuXHRcdFx0Ly8gV2UgY2FuIGJyZWFrIHRoZSBwcm9ibGVtIGRvd24gcmVjdXJzaXZlbHkgYnkgZmluZGluZyB0aGUgY2hhbmdlcyBpbiB0aGVcblx0XHRcdC8vIEZpcnN0IEhhbGY6ICAgKG9yaWdpbmFsU3RhcnQsIG1vZGlmaWVkU3RhcnQpIHRvIChtaWRPcmlnaW5hbCwgbWlkTW9kaWZpZWQpXG5cdFx0XHQvLyBTZWNvbmQgSGFsZjogIChtaWRPcmlnaW5hbCArIDEsIG1pbk1vZGlmaWVkICsgMSkgdG8gKG9yaWdpbmFsRW5kLCBtb2RpZmllZEVuZClcblx0XHRcdC8vIE5PVEU6IENvbXB1dGVEaWZmKCkgaXMgaW5jbHVzaXZlLCB0aGVyZWZvcmUgdGhlIHNlY29uZCByYW5nZSBzdGFydHMgb24gdGhlIG5leHQgcG9pbnRcblxuXHRcdFx0Y29uc3QgbGVmdENoYW5nZXMgPSB0aGlzLkNvbXB1dGVEaWZmUmVjdXJzaXZlKG9yaWdpbmFsU3RhcnQsIG1pZE9yaWdpbmFsLCBtb2RpZmllZFN0YXJ0LCBtaWRNb2RpZmllZCwgcXVpdEVhcmx5QXJyKTtcblx0XHRcdGxldCByaWdodENoYW5nZXM6IERpZmZDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0XHRpZiAoIXF1aXRFYXJseUFyclswXSkge1xuXHRcdFx0XHRyaWdodENoYW5nZXMgPSB0aGlzLkNvbXB1dGVEaWZmUmVjdXJzaXZlKG1pZE9yaWdpbmFsICsgMSwgb3JpZ2luYWxFbmQsIG1pZE1vZGlmaWVkICsgMSwgbW9kaWZpZWRFbmQsIHF1aXRFYXJseUFycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBXZSBkaWRuJ3QgaGF2ZSB0aW1lIHRvIGZpbmlzaCB0aGUgZmlyc3QgaGFsZiwgc28gd2UgZG9uJ3QgaGF2ZSB0aW1lIHRvIGNvbXB1dGUgdGhpcyBoYWxmLlxuXHRcdFx0XHQvLyBDb25zaWRlciB0aGUgZW50aXJlIHJlc3Qgb2YgdGhlIHNlcXVlbmNlIGRpZmZlcmVudC5cblx0XHRcdFx0cmlnaHRDaGFuZ2VzID0gW1xuXHRcdFx0XHRcdG5ldyBEaWZmQ2hhbmdlKG1pZE9yaWdpbmFsICsgMSwgb3JpZ2luYWxFbmQgLSAobWlkT3JpZ2luYWwgKyAxKSArIDEsIG1pZE1vZGlmaWVkICsgMSwgbW9kaWZpZWRFbmQgLSAobWlkTW9kaWZpZWQgKyAxKSArIDEpXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLkNvbmNhdGVuYXRlQ2hhbmdlcyhsZWZ0Q2hhbmdlcywgcmlnaHRDaGFuZ2VzKTtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBoaXQgaGVyZSwgd2UgcXVpdCBlYXJseSwgYW5kIHNvIGNhbid0IHJldHVybiBhbnl0aGluZyBtZWFuaW5nZnVsXG5cdFx0cmV0dXJuIFtcblx0XHRcdG5ldyBEaWZmQ2hhbmdlKG9yaWdpbmFsU3RhcnQsIG9yaWdpbmFsRW5kIC0gb3JpZ2luYWxTdGFydCArIDEsIG1vZGlmaWVkU3RhcnQsIG1vZGlmaWVkRW5kIC0gbW9kaWZpZWRTdGFydCArIDEpXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgV0FMS1RSQUNFKGRpYWdvbmFsRm9yd2FyZEJhc2U6IG51bWJlciwgZGlhZ29uYWxGb3J3YXJkU3RhcnQ6IG51bWJlciwgZGlhZ29uYWxGb3J3YXJkRW5kOiBudW1iZXIsIGRpYWdvbmFsRm9yd2FyZE9mZnNldDogbnVtYmVyLFxuXHRcdGRpYWdvbmFsUmV2ZXJzZUJhc2U6IG51bWJlciwgZGlhZ29uYWxSZXZlcnNlU3RhcnQ6IG51bWJlciwgZGlhZ29uYWxSZXZlcnNlRW5kOiBudW1iZXIsIGRpYWdvbmFsUmV2ZXJzZU9mZnNldDogbnVtYmVyLFxuXHRcdGZvcndhcmRQb2ludHM6IEludDMyQXJyYXksIHJldmVyc2VQb2ludHM6IEludDMyQXJyYXksXG5cdFx0b3JpZ2luYWxJbmRleDogbnVtYmVyLCBvcmlnaW5hbEVuZDogbnVtYmVyLCBtaWRPcmlnaW5hbEFycjogbnVtYmVyW10sXG5cdFx0bW9kaWZpZWRJbmRleDogbnVtYmVyLCBtb2RpZmllZEVuZDogbnVtYmVyLCBtaWRNb2RpZmllZEFycjogbnVtYmVyW10sXG5cdFx0ZGVsdGFJc0V2ZW46IGJvb2xlYW4sIHF1aXRFYXJseUFycjogYm9vbGVhbltdXG5cdCk6IERpZmZDaGFuZ2VbXSB7XG5cdFx0bGV0IGZvcndhcmRDaGFuZ2VzOiBEaWZmQ2hhbmdlW10gfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcmV2ZXJzZUNoYW5nZXM6IERpZmZDaGFuZ2VbXSB8IG51bGwgPSBudWxsO1xuXG5cdFx0Ly8gRmlyc3QsIHdhbGsgYmFja3dhcmQgdGhyb3VnaCB0aGUgZm9yd2FyZCBkaWFnb25hbHMgaGlzdG9yeVxuXHRcdGxldCBjaGFuZ2VIZWxwZXIgPSBuZXcgRGlmZkNoYW5nZUhlbHBlcigpO1xuXHRcdGxldCBkaWFnb25hbE1pbiA9IGRpYWdvbmFsRm9yd2FyZFN0YXJ0O1xuXHRcdGxldCBkaWFnb25hbE1heCA9IGRpYWdvbmFsRm9yd2FyZEVuZDtcblx0XHRsZXQgZGlhZ29uYWxSZWxhdGl2ZSA9IChtaWRPcmlnaW5hbEFyclswXSAtIG1pZE1vZGlmaWVkQXJyWzBdKSAtIGRpYWdvbmFsRm9yd2FyZE9mZnNldDtcblx0XHRsZXQgbGFzdE9yaWdpbmFsSW5kZXggPSBDb25zdGFudHMuTUlOX1NBRkVfU01BTExfSU5URUdFUjtcblx0XHRsZXQgaGlzdG9yeUluZGV4ID0gdGhpcy5tX2ZvcndhcmRIaXN0b3J5Lmxlbmd0aCAtIDE7XG5cblx0XHRkbyB7XG5cdFx0XHQvLyBHZXQgdGhlIGRpYWdvbmFsIGluZGV4IGZyb20gdGhlIHJlbGF0aXZlIGRpYWdvbmFsIG51bWJlclxuXHRcdFx0Y29uc3QgZGlhZ29uYWwgPSBkaWFnb25hbFJlbGF0aXZlICsgZGlhZ29uYWxGb3J3YXJkQmFzZTtcblxuXHRcdFx0Ly8gRmlndXJlIG91dCB3aGVyZSB3ZSBjYW1lIGZyb21cblx0XHRcdGlmIChkaWFnb25hbCA9PT0gZGlhZ29uYWxNaW4gfHwgKGRpYWdvbmFsIDwgZGlhZ29uYWxNYXggJiYgZm9yd2FyZFBvaW50c1tkaWFnb25hbCAtIDFdIDwgZm9yd2FyZFBvaW50c1tkaWFnb25hbCArIDFdKSkge1xuXHRcdFx0XHQvLyBWZXJ0aWNhbCBsaW5lICh0aGUgZWxlbWVudCBpcyBhbiBpbnNlcnQpXG5cdFx0XHRcdG9yaWdpbmFsSW5kZXggPSBmb3J3YXJkUG9pbnRzW2RpYWdvbmFsICsgMV07XG5cdFx0XHRcdG1vZGlmaWVkSW5kZXggPSBvcmlnaW5hbEluZGV4IC0gZGlhZ29uYWxSZWxhdGl2ZSAtIGRpYWdvbmFsRm9yd2FyZE9mZnNldDtcblx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggPCBsYXN0T3JpZ2luYWxJbmRleCkge1xuXHRcdFx0XHRcdGNoYW5nZUhlbHBlci5NYXJrTmV4dENoYW5nZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleDtcblx0XHRcdFx0Y2hhbmdlSGVscGVyLkFkZE1vZGlmaWVkRWxlbWVudChvcmlnaW5hbEluZGV4ICsgMSwgbW9kaWZpZWRJbmRleCk7XG5cdFx0XHRcdGRpYWdvbmFsUmVsYXRpdmUgPSAoZGlhZ29uYWwgKyAxKSAtIGRpYWdvbmFsRm9yd2FyZEJhc2U7IC8vU2V0dXAgZm9yIHRoZSBuZXh0IGl0ZXJhdGlvblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSG9yaXpvbnRhbCBsaW5lICh0aGUgZWxlbWVudCBpcyBhIGRlbGV0aW9uKVxuXHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gZm9yd2FyZFBvaW50c1tkaWFnb25hbCAtIDFdICsgMTtcblx0XHRcdFx0bW9kaWZpZWRJbmRleCA9IG9yaWdpbmFsSW5kZXggLSBkaWFnb25hbFJlbGF0aXZlIC0gZGlhZ29uYWxGb3J3YXJkT2Zmc2V0O1xuXHRcdFx0XHRpZiAob3JpZ2luYWxJbmRleCA8IGxhc3RPcmlnaW5hbEluZGV4KSB7XG5cdFx0XHRcdFx0Y2hhbmdlSGVscGVyLk1hcmtOZXh0Q2hhbmdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdE9yaWdpbmFsSW5kZXggPSBvcmlnaW5hbEluZGV4IC0gMTtcblx0XHRcdFx0Y2hhbmdlSGVscGVyLkFkZE9yaWdpbmFsRWxlbWVudChvcmlnaW5hbEluZGV4LCBtb2RpZmllZEluZGV4ICsgMSk7XG5cdFx0XHRcdGRpYWdvbmFsUmVsYXRpdmUgPSAoZGlhZ29uYWwgLSAxKSAtIGRpYWdvbmFsRm9yd2FyZEJhc2U7IC8vU2V0dXAgZm9yIHRoZSBuZXh0IGl0ZXJhdGlvblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGlzdG9yeUluZGV4ID49IDApIHtcblx0XHRcdFx0Zm9yd2FyZFBvaW50cyA9IHRoaXMubV9mb3J3YXJkSGlzdG9yeVtoaXN0b3J5SW5kZXhdO1xuXHRcdFx0XHRkaWFnb25hbEZvcndhcmRCYXNlID0gZm9yd2FyZFBvaW50c1swXTsgLy9XZSBzdG9yZWQgdGhpcyBpbiB0aGUgZmlyc3Qgc3BvdFxuXHRcdFx0XHRkaWFnb25hbE1pbiA9IDE7XG5cdFx0XHRcdGRpYWdvbmFsTWF4ID0gZm9yd2FyZFBvaW50cy5sZW5ndGggLSAxO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKC0taGlzdG9yeUluZGV4ID49IC0xKTtcblxuXHRcdC8vIElyb25pY2FsbHksIHdlIGdldCB0aGUgZm9yd2FyZCBjaGFuZ2VzIGFzIHRoZSByZXZlcnNlIG9mIHRoZVxuXHRcdC8vIG9yZGVyIHdlIGFkZGVkIHRoZW0gc2luY2Ugd2UgdGVjaG5pY2FsbHkgYWRkZWQgdGhlbSBiYWNrd2FyZHNcblx0XHRmb3J3YXJkQ2hhbmdlcyA9IGNoYW5nZUhlbHBlci5nZXRSZXZlcnNlQ2hhbmdlcygpO1xuXG5cdFx0aWYgKHF1aXRFYXJseUFyclswXSkge1xuXHRcdFx0Ly8gVE9ETzogQ2FsY3VsYXRlIGEgcGFydGlhbCBmcm9tIHRoZSByZXZlcnNlIGRpYWdvbmFscy5cblx0XHRcdC8vICAgICAgIEZvciBub3csIGp1c3QgYXNzdW1lIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIG1pZE9yaWdpbmFsL21pZE1vZGlmaWVkIHBvaW50IGlzIGEgZGlmZlxuXG5cdFx0XHRsZXQgb3JpZ2luYWxTdGFydFBvaW50ID0gbWlkT3JpZ2luYWxBcnJbMF0gKyAxO1xuXHRcdFx0bGV0IG1vZGlmaWVkU3RhcnRQb2ludCA9IG1pZE1vZGlmaWVkQXJyWzBdICsgMTtcblxuXHRcdFx0aWYgKGZvcndhcmRDaGFuZ2VzICE9PSBudWxsICYmIGZvcndhcmRDaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgbGFzdEZvcndhcmRDaGFuZ2UgPSBmb3J3YXJkQ2hhbmdlc1tmb3J3YXJkQ2hhbmdlcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0b3JpZ2luYWxTdGFydFBvaW50ID0gTWF0aC5tYXgob3JpZ2luYWxTdGFydFBvaW50LCBsYXN0Rm9yd2FyZENoYW5nZS5nZXRPcmlnaW5hbEVuZCgpKTtcblx0XHRcdFx0bW9kaWZpZWRTdGFydFBvaW50ID0gTWF0aC5tYXgobW9kaWZpZWRTdGFydFBvaW50LCBsYXN0Rm9yd2FyZENoYW5nZS5nZXRNb2RpZmllZEVuZCgpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV2ZXJzZUNoYW5nZXMgPSBbXG5cdFx0XHRcdG5ldyBEaWZmQ2hhbmdlKG9yaWdpbmFsU3RhcnRQb2ludCwgb3JpZ2luYWxFbmQgLSBvcmlnaW5hbFN0YXJ0UG9pbnQgKyAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnRQb2ludCwgbW9kaWZpZWRFbmQgLSBtb2RpZmllZFN0YXJ0UG9pbnQgKyAxKVxuXHRcdFx0XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm93IHdhbGsgYmFja3dhcmQgdGhyb3VnaCB0aGUgcmV2ZXJzZSBkaWFnb25hbHMgaGlzdG9yeVxuXHRcdFx0Y2hhbmdlSGVscGVyID0gbmV3IERpZmZDaGFuZ2VIZWxwZXIoKTtcblx0XHRcdGRpYWdvbmFsTWluID0gZGlhZ29uYWxSZXZlcnNlU3RhcnQ7XG5cdFx0XHRkaWFnb25hbE1heCA9IGRpYWdvbmFsUmV2ZXJzZUVuZDtcblx0XHRcdGRpYWdvbmFsUmVsYXRpdmUgPSAobWlkT3JpZ2luYWxBcnJbMF0gLSBtaWRNb2RpZmllZEFyclswXSkgLSBkaWFnb25hbFJldmVyc2VPZmZzZXQ7XG5cdFx0XHRsYXN0T3JpZ2luYWxJbmRleCA9IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSO1xuXHRcdFx0aGlzdG9yeUluZGV4ID0gKGRlbHRhSXNFdmVuKSA/IHRoaXMubV9yZXZlcnNlSGlzdG9yeS5sZW5ndGggLSAxIDogdGhpcy5tX3JldmVyc2VIaXN0b3J5Lmxlbmd0aCAtIDI7XG5cblx0XHRcdGRvIHtcblx0XHRcdFx0Ly8gR2V0IHRoZSBkaWFnb25hbCBpbmRleCBmcm9tIHRoZSByZWxhdGl2ZSBkaWFnb25hbCBudW1iZXJcblx0XHRcdFx0Y29uc3QgZGlhZ29uYWwgPSBkaWFnb25hbFJlbGF0aXZlICsgZGlhZ29uYWxSZXZlcnNlQmFzZTtcblxuXHRcdFx0XHQvLyBGaWd1cmUgb3V0IHdoZXJlIHdlIGNhbWUgZnJvbVxuXHRcdFx0XHRpZiAoZGlhZ29uYWwgPT09IGRpYWdvbmFsTWluIHx8IChkaWFnb25hbCA8IGRpYWdvbmFsTWF4ICYmIHJldmVyc2VQb2ludHNbZGlhZ29uYWwgLSAxXSA+PSByZXZlcnNlUG9pbnRzW2RpYWdvbmFsICsgMV0pKSB7XG5cdFx0XHRcdFx0Ly8gSG9yaXpvbnRhbCBsaW5lICh0aGUgZWxlbWVudCBpcyBhIGRlbGV0aW9uKSlcblx0XHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbCArIDFdIC0gMTtcblx0XHRcdFx0XHRtb2RpZmllZEluZGV4ID0gb3JpZ2luYWxJbmRleCAtIGRpYWdvbmFsUmVsYXRpdmUgLSBkaWFnb25hbFJldmVyc2VPZmZzZXQ7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggPiBsYXN0T3JpZ2luYWxJbmRleCkge1xuXHRcdFx0XHRcdFx0Y2hhbmdlSGVscGVyLk1hcmtOZXh0Q2hhbmdlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhc3RPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleCArIDE7XG5cdFx0XHRcdFx0Y2hhbmdlSGVscGVyLkFkZE9yaWdpbmFsRWxlbWVudChvcmlnaW5hbEluZGV4ICsgMSwgbW9kaWZpZWRJbmRleCArIDEpO1xuXHRcdFx0XHRcdGRpYWdvbmFsUmVsYXRpdmUgPSAoZGlhZ29uYWwgKyAxKSAtIGRpYWdvbmFsUmV2ZXJzZUJhc2U7IC8vU2V0dXAgZm9yIHRoZSBuZXh0IGl0ZXJhdGlvblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFZlcnRpY2FsIGxpbmUgKHRoZSBlbGVtZW50IGlzIGFuIGluc2VydGlvbilcblx0XHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbCAtIDFdO1xuXHRcdFx0XHRcdG1vZGlmaWVkSW5kZXggPSBvcmlnaW5hbEluZGV4IC0gZGlhZ29uYWxSZWxhdGl2ZSAtIGRpYWdvbmFsUmV2ZXJzZU9mZnNldDtcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxJbmRleCA+IGxhc3RPcmlnaW5hbEluZGV4KSB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VIZWxwZXIuTWFya05leHRDaGFuZ2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFzdE9yaWdpbmFsSW5kZXggPSBvcmlnaW5hbEluZGV4O1xuXHRcdFx0XHRcdGNoYW5nZUhlbHBlci5BZGRNb2RpZmllZEVsZW1lbnQob3JpZ2luYWxJbmRleCArIDEsIG1vZGlmaWVkSW5kZXggKyAxKTtcblx0XHRcdFx0XHRkaWFnb25hbFJlbGF0aXZlID0gKGRpYWdvbmFsIC0gMSkgLSBkaWFnb25hbFJldmVyc2VCYXNlOyAvL1NldHVwIGZvciB0aGUgbmV4dCBpdGVyYXRpb25cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChoaXN0b3J5SW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdHJldmVyc2VQb2ludHMgPSB0aGlzLm1fcmV2ZXJzZUhpc3RvcnlbaGlzdG9yeUluZGV4XTtcblx0XHRcdFx0XHRkaWFnb25hbFJldmVyc2VCYXNlID0gcmV2ZXJzZVBvaW50c1swXTsgLy9XZSBzdG9yZWQgdGhpcyBpbiB0aGUgZmlyc3Qgc3BvdFxuXHRcdFx0XHRcdGRpYWdvbmFsTWluID0gMTtcblx0XHRcdFx0XHRkaWFnb25hbE1heCA9IHJldmVyc2VQb2ludHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0fVxuXHRcdFx0fSB3aGlsZSAoLS1oaXN0b3J5SW5kZXggPj0gLTEpO1xuXG5cdFx0XHQvLyBUaGVyZSBhcmUgY2FzZXMgd2hlcmUgdGhlIHJldmVyc2UgaGlzdG9yeSB3aWxsIGZpbmQgZGlmZnMgdGhhdFxuXHRcdFx0Ly8gYXJlIGNvcnJlY3QsIGJ1dCBub3QgaW50dWl0aXZlLCBzbyB3ZSBuZWVkIHNoaWZ0IHRoZW0uXG5cdFx0XHRyZXZlcnNlQ2hhbmdlcyA9IGNoYW5nZUhlbHBlci5nZXRDaGFuZ2VzKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuQ29uY2F0ZW5hdGVDaGFuZ2VzKGZvcndhcmRDaGFuZ2VzLCByZXZlcnNlQ2hhbmdlcyk7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gdGhlIHJhbmdlIHRvIGNvbXB1dGUgdGhlIGRpZmYgb24sIHRoaXMgbWV0aG9kIGZpbmRzIHRoZSBwb2ludDpcblx0ICogKG1pZE9yaWdpbmFsLCBtaWRNb2RpZmllZClcblx0ICogdGhhdCBleGlzdHMgaW4gdGhlIG1pZGRsZSBvZiB0aGUgTENTIG9mIHRoZSB0d28gc2VxdWVuY2VzIGFuZFxuXHQgKiBpcyB0aGUgcG9pbnQgYXQgd2hpY2ggdGhlIExDUyBwcm9ibGVtIG1heSBiZSBicm9rZW4gZG93biByZWN1cnNpdmVseS5cblx0ICogVGhpcyBtZXRob2Qgd2lsbCB0cnkgdG8ga2VlcCB0aGUgTENTIHRyYWNlIGluIG1lbW9yeS4gSWYgdGhlIExDUyByZWN1cnNpb25cblx0ICogcG9pbnQgaXMgY2FsY3VsYXRlZCBhbmQgdGhlIGZ1bGwgdHJhY2UgaXMgYXZhaWxhYmxlIGluIG1lbW9yeSwgdGhlbiB0aGlzIG1ldGhvZFxuXHQgKiB3aWxsIHJldHVybiB0aGUgY2hhbmdlIGxpc3QuXG5cdCAqIEBwYXJhbSBvcmlnaW5hbFN0YXJ0IFRoZSBzdGFydCBib3VuZCBvZiB0aGUgb3JpZ2luYWwgc2VxdWVuY2UgcmFuZ2Vcblx0ICogQHBhcmFtIG9yaWdpbmFsRW5kIFRoZSBlbmQgYm91bmQgb2YgdGhlIG9yaWdpbmFsIHNlcXVlbmNlIHJhbmdlXG5cdCAqIEBwYXJhbSBtb2RpZmllZFN0YXJ0IFRoZSBzdGFydCBib3VuZCBvZiB0aGUgbW9kaWZpZWQgc2VxdWVuY2UgcmFuZ2Vcblx0ICogQHBhcmFtIG1vZGlmaWVkRW5kIFRoZSBlbmQgYm91bmQgb2YgdGhlIG1vZGlmaWVkIHNlcXVlbmNlIHJhbmdlXG5cdCAqIEBwYXJhbSBtaWRPcmlnaW5hbCBUaGUgbWlkZGxlIHBvaW50IG9mIHRoZSBvcmlnaW5hbCBzZXF1ZW5jZSByYW5nZVxuXHQgKiBAcGFyYW0gbWlkTW9kaWZpZWQgVGhlIG1pZGRsZSBwb2ludCBvZiB0aGUgbW9kaWZpZWQgc2VxdWVuY2UgcmFuZ2Vcblx0ICogQHJldHVybnMgVGhlIGRpZmYgY2hhbmdlcywgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgbnVsbFxuXHQgKi9cblx0cHJpdmF0ZSBDb21wdXRlUmVjdXJzaW9uUG9pbnQob3JpZ2luYWxTdGFydDogbnVtYmVyLCBvcmlnaW5hbEVuZDogbnVtYmVyLCBtb2RpZmllZFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkRW5kOiBudW1iZXIsIG1pZE9yaWdpbmFsQXJyOiBudW1iZXJbXSwgbWlkTW9kaWZpZWRBcnI6IG51bWJlcltdLCBxdWl0RWFybHlBcnI6IGJvb2xlYW5bXSkge1xuXHRcdGxldCBvcmlnaW5hbEluZGV4ID0gMCwgbW9kaWZpZWRJbmRleCA9IDA7XG5cdFx0bGV0IGRpYWdvbmFsRm9yd2FyZFN0YXJ0ID0gMCwgZGlhZ29uYWxGb3J3YXJkRW5kID0gMDtcblx0XHRsZXQgZGlhZ29uYWxSZXZlcnNlU3RhcnQgPSAwLCBkaWFnb25hbFJldmVyc2VFbmQgPSAwO1xuXG5cdFx0Ly8gVG8gdHJhdmVyc2UgdGhlIGVkaXQgZ3JhcGggYW5kIHByb2R1Y2UgdGhlIHByb3BlciBMQ1MsIG91ciBhY3R1YWxcblx0XHQvLyBzdGFydCBwb3NpdGlvbiBpcyBqdXN0IG91dHNpZGUgdGhlIGdpdmVuIGJvdW5kYXJ5XG5cdFx0b3JpZ2luYWxTdGFydC0tO1xuXHRcdG1vZGlmaWVkU3RhcnQtLTtcblxuXHRcdC8vIFdlIHNldCB0aGVzZSB1cCB0byBtYWtlIHRoZSBjb21waWxlciBoYXBweSwgYnV0IHRoZXkgd2lsbFxuXHRcdC8vIGJlIHJlcGxhY2VkIGJlZm9yZSB3ZSByZXR1cm4gd2l0aCB0aGUgYWN0dWFsIHJlY3Vyc2lvbiBwb2ludFxuXHRcdG1pZE9yaWdpbmFsQXJyWzBdID0gMDtcblx0XHRtaWRNb2RpZmllZEFyclswXSA9IDA7XG5cblx0XHQvLyBDbGVhciBvdXQgdGhlIGhpc3Rvcnlcblx0XHR0aGlzLm1fZm9yd2FyZEhpc3RvcnkgPSBbXTtcblx0XHR0aGlzLm1fcmV2ZXJzZUhpc3RvcnkgPSBbXTtcblxuXHRcdC8vIEVhY2ggY2VsbCBpbiB0aGUgdHdvIGFycmF5cyBjb3JyZXNwb25kcyB0byBhIGRpYWdvbmFsIGluIHRoZSBlZGl0IGdyYXBoLlxuXHRcdC8vIFRoZSBpbnRlZ2VyIHZhbHVlIGluIHRoZSBjZWxsIHJlcHJlc2VudHMgdGhlIG9yaWdpbmFsSW5kZXggb2YgdGhlIGZ1cnRoZXN0XG5cdFx0Ly8gcmVhY2hpbmcgcG9pbnQgZm91bmQgc28gZmFyIHRoYXQgZW5kcyBpbiB0aGF0IGRpYWdvbmFsLlxuXHRcdC8vIFRoZSBtb2RpZmllZEluZGV4IGNhbiBiZSBjb21wdXRlZCBtYXRoZW1hdGljYWxseSBmcm9tIHRoZSBvcmlnaW5hbEluZGV4IGFuZCB0aGUgZGlhZ29uYWwgbnVtYmVyLlxuXHRcdGNvbnN0IG1heERpZmZlcmVuY2VzID0gKG9yaWdpbmFsRW5kIC0gb3JpZ2luYWxTdGFydCkgKyAobW9kaWZpZWRFbmQgLSBtb2RpZmllZFN0YXJ0KTtcblx0XHRjb25zdCBudW1EaWFnb25hbHMgPSBtYXhEaWZmZXJlbmNlcyArIDE7XG5cdFx0Y29uc3QgZm9yd2FyZFBvaW50cyA9IG5ldyBJbnQzMkFycmF5KG51bURpYWdvbmFscyk7XG5cdFx0Y29uc3QgcmV2ZXJzZVBvaW50cyA9IG5ldyBJbnQzMkFycmF5KG51bURpYWdvbmFscyk7XG5cdFx0Ly8gZGlhZ29uYWxGb3J3YXJkQmFzZTogSW5kZXggaW50byBmb3J3YXJkUG9pbnRzIG9mIHRoZSBkaWFnb25hbCB3aGljaCBwYXNzZXMgdGhyb3VnaCAob3JpZ2luYWxTdGFydCwgbW9kaWZpZWRTdGFydClcblx0XHQvLyBkaWFnb25hbFJldmVyc2VCYXNlOiBJbmRleCBpbnRvIHJldmVyc2VQb2ludHMgb2YgdGhlIGRpYWdvbmFsIHdoaWNoIHBhc3NlcyB0aHJvdWdoIChvcmlnaW5hbEVuZCwgbW9kaWZpZWRFbmQpXG5cdFx0Y29uc3QgZGlhZ29uYWxGb3J3YXJkQmFzZSA9IChtb2RpZmllZEVuZCAtIG1vZGlmaWVkU3RhcnQpO1xuXHRcdGNvbnN0IGRpYWdvbmFsUmV2ZXJzZUJhc2UgPSAob3JpZ2luYWxFbmQgLSBvcmlnaW5hbFN0YXJ0KTtcblx0XHQvLyBkaWFnb25hbEZvcndhcmRPZmZzZXQ6IEdlb21ldHJpYyBvZmZzZXQgd2hpY2ggYWxsb3dzIG1vZGlmaWVkSW5kZXggdG8gYmUgY29tcHV0ZWQgZnJvbSBvcmlnaW5hbEluZGV4IGFuZCB0aGVcblx0XHQvLyAgICBkaWFnb25hbCBudW1iZXIgKHJlbGF0aXZlIHRvIGRpYWdvbmFsRm9yd2FyZEJhc2UpXG5cdFx0Ly8gZGlhZ29uYWxSZXZlcnNlT2Zmc2V0OiBHZW9tZXRyaWMgb2Zmc2V0IHdoaWNoIGFsbG93cyBtb2RpZmllZEluZGV4IHRvIGJlIGNvbXB1dGVkIGZyb20gb3JpZ2luYWxJbmRleCBhbmQgdGhlXG5cdFx0Ly8gICAgZGlhZ29uYWwgbnVtYmVyIChyZWxhdGl2ZSB0byBkaWFnb25hbFJldmVyc2VCYXNlKVxuXHRcdGNvbnN0IGRpYWdvbmFsRm9yd2FyZE9mZnNldCA9IChvcmlnaW5hbFN0YXJ0IC0gbW9kaWZpZWRTdGFydCk7XG5cdFx0Y29uc3QgZGlhZ29uYWxSZXZlcnNlT2Zmc2V0ID0gKG9yaWdpbmFsRW5kIC0gbW9kaWZpZWRFbmQpO1xuXG5cdFx0Ly8gZGVsdGE6IFRoZSBkaWZmZXJlbmNlIGJldHdlZW4gdGhlIGVuZCBkaWFnb25hbCBhbmQgdGhlIHN0YXJ0IGRpYWdvbmFsLiBUaGlzIGlzIHVzZWQgdG8gcmVsYXRlIGRpYWdvbmFsIG51bWJlcnNcblx0XHQvLyAgIHJlbGF0aXZlIHRvIHRoZSBzdGFydCBkaWFnb25hbCB3aXRoIGRpYWdvbmFsIG51bWJlcnMgcmVsYXRpdmUgdG8gdGhlIGVuZCBkaWFnb25hbC5cblx0XHQvLyBUaGUgRXZlbi9PZGRuLW5lc3Mgb2YgdGhpcyBkZWx0YSBpcyBpbXBvcnRhbnQgZm9yIGRldGVybWluaW5nIHdoZW4gd2Ugc2hvdWxkIGNoZWNrIGZvciBvdmVybGFwXG5cdFx0Y29uc3QgZGVsdGEgPSBkaWFnb25hbFJldmVyc2VCYXNlIC0gZGlhZ29uYWxGb3J3YXJkQmFzZTtcblx0XHRjb25zdCBkZWx0YUlzRXZlbiA9IChkZWx0YSAlIDIgPT09IDApO1xuXG5cdFx0Ly8gSGVyZSB3ZSBzZXQgdXAgdGhlIHN0YXJ0IGFuZCBlbmQgcG9pbnRzIGFzIHRoZSBmdXJ0aGVzdCBwb2ludHMgZm91bmQgc28gZmFyXG5cdFx0Ly8gaW4gYm90aCB0aGUgZm9yd2FyZCBhbmQgcmV2ZXJzZSBkaXJlY3Rpb25zLCByZXNwZWN0aXZlbHlcblx0XHRmb3J3YXJkUG9pbnRzW2RpYWdvbmFsRm9yd2FyZEJhc2VdID0gb3JpZ2luYWxTdGFydDtcblx0XHRyZXZlcnNlUG9pbnRzW2RpYWdvbmFsUmV2ZXJzZUJhc2VdID0gb3JpZ2luYWxFbmQ7XG5cblx0XHQvLyBSZW1lbWJlciBpZiB3ZSBxdWl0IGVhcmx5LCBhbmQgdGh1cyBuZWVkIHRvIGRvIGEgYmVzdC1lZmZvcnQgcmVzdWx0IGluc3RlYWQgb2YgYSByZWFsIHJlc3VsdC5cblx0XHRxdWl0RWFybHlBcnJbMF0gPSBmYWxzZTtcblxuXG5cblx0XHQvLyBBIGNvdXBsZSBvZiBwb2ludHM6XG5cdFx0Ly8gLS1XaXRoIHRoaXMgbWV0aG9kLCB3ZSBpdGVyYXRlIG9uIHRoZSBudW1iZXIgb2YgZGlmZmVyZW5jZXMgYmV0d2VlbiB0aGUgdHdvIHNlcXVlbmNlcy5cblx0XHQvLyAgIFRoZSBtb3JlIGRpZmZlcmVuY2VzIHRoZXJlIGFjdHVhbGx5IGFyZSwgdGhlIGxvbmdlciB0aGlzIHdpbGwgdGFrZS5cblx0XHQvLyAtLUFsc28sIGFzIHRoZSBudW1iZXIgb2YgZGlmZmVyZW5jZXMgaW5jcmVhc2VzLCB3ZSBoYXZlIHRvIHNlYXJjaCBvbiBkaWFnb25hbHMgZnVydGhlclxuXHRcdC8vICAgYXdheSBmcm9tIHRoZSByZWZlcmVuY2UgZGlhZ29uYWwgKHdoaWNoIGlzIGRpYWdvbmFsRm9yd2FyZEJhc2UgZm9yIGZvcndhcmQsIGRpYWdvbmFsUmV2ZXJzZUJhc2UgZm9yIHJldmVyc2UpLlxuXHRcdC8vIC0tV2UgZXh0ZW5kIG9uIGV2ZW4gZGlhZ29uYWxzIChyZWxhdGl2ZSB0byB0aGUgcmVmZXJlbmNlIGRpYWdvbmFsKSBvbmx5IHdoZW4gbnVtRGlmZmVyZW5jZXNcblx0XHQvLyAgIGlzIGV2ZW4gYW5kIG9kZCBkaWFnb25hbHMgb25seSB3aGVuIG51bURpZmZlcmVuY2VzIGlzIG9kZC5cblx0XHRmb3IgKGxldCBudW1EaWZmZXJlbmNlcyA9IDE7IG51bURpZmZlcmVuY2VzIDw9IChtYXhEaWZmZXJlbmNlcyAvIDIpICsgMTsgbnVtRGlmZmVyZW5jZXMrKykge1xuXHRcdFx0bGV0IGZ1cnRoZXN0T3JpZ2luYWxJbmRleCA9IDA7XG5cdFx0XHRsZXQgZnVydGhlc3RNb2RpZmllZEluZGV4ID0gMDtcblxuXHRcdFx0Ly8gUnVuIHRoZSBhbGdvcml0aG0gaW4gdGhlIGZvcndhcmQgZGlyZWN0aW9uXG5cdFx0XHRkaWFnb25hbEZvcndhcmRTdGFydCA9IHRoaXMuQ2xpcERpYWdvbmFsQm91bmQoZGlhZ29uYWxGb3J3YXJkQmFzZSAtIG51bURpZmZlcmVuY2VzLCBudW1EaWZmZXJlbmNlcywgZGlhZ29uYWxGb3J3YXJkQmFzZSwgbnVtRGlhZ29uYWxzKTtcblx0XHRcdGRpYWdvbmFsRm9yd2FyZEVuZCA9IHRoaXMuQ2xpcERpYWdvbmFsQm91bmQoZGlhZ29uYWxGb3J3YXJkQmFzZSArIG51bURpZmZlcmVuY2VzLCBudW1EaWZmZXJlbmNlcywgZGlhZ29uYWxGb3J3YXJkQmFzZSwgbnVtRGlhZ29uYWxzKTtcblx0XHRcdGZvciAobGV0IGRpYWdvbmFsID0gZGlhZ29uYWxGb3J3YXJkU3RhcnQ7IGRpYWdvbmFsIDw9IGRpYWdvbmFsRm9yd2FyZEVuZDsgZGlhZ29uYWwgKz0gMikge1xuXHRcdFx0XHQvLyBTVEVQIDE6IFdlIGV4dGVuZCB0aGUgZnVydGhlc3QgcmVhY2hpbmcgcG9pbnQgaW4gdGhlIHByZXNlbnQgZGlhZ29uYWxcblx0XHRcdFx0Ly8gYnkgbG9va2luZyBhdCB0aGUgZGlhZ29uYWxzIGFib3ZlIGFuZCBiZWxvdyBhbmQgcGlja2luZyB0aGUgb25lIHdob3NlIHBvaW50XG5cdFx0XHRcdC8vIGlzIGZ1cnRoZXIgYXdheSBmcm9tIHRoZSBzdGFydCBwb2ludCAob3JpZ2luYWxTdGFydCwgbW9kaWZpZWRTdGFydClcblx0XHRcdFx0aWYgKGRpYWdvbmFsID09PSBkaWFnb25hbEZvcndhcmRTdGFydCB8fCAoZGlhZ29uYWwgPCBkaWFnb25hbEZvcndhcmRFbmQgJiYgZm9yd2FyZFBvaW50c1tkaWFnb25hbCAtIDFdIDwgZm9yd2FyZFBvaW50c1tkaWFnb25hbCArIDFdKSkge1xuXHRcdFx0XHRcdG9yaWdpbmFsSW5kZXggPSBmb3J3YXJkUG9pbnRzW2RpYWdvbmFsICsgMV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxJbmRleCA9IGZvcndhcmRQb2ludHNbZGlhZ29uYWwgLSAxXSArIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kaWZpZWRJbmRleCA9IG9yaWdpbmFsSW5kZXggLSAoZGlhZ29uYWwgLSBkaWFnb25hbEZvcndhcmRCYXNlKSAtIGRpYWdvbmFsRm9yd2FyZE9mZnNldDtcblxuXHRcdFx0XHQvLyBTYXZlIHRoZSBjdXJyZW50IG9yaWdpbmFsSW5kZXggc28gd2UgY2FuIHRlc3QgZm9yIGZhbHNlIG92ZXJsYXAgaW4gc3RlcCAzXG5cdFx0XHRcdGNvbnN0IHRlbXBPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleDtcblxuXHRcdFx0XHQvLyBTVEVQIDI6IFdlIGNhbiBjb250aW51ZSB0byBleHRlbmQgdGhlIGZ1cnRoZXN0IHJlYWNoaW5nIHBvaW50IGluIHRoZSBwcmVzZW50IGRpYWdvbmFsXG5cdFx0XHRcdC8vIHNvIGxvbmcgYXMgdGhlIGVsZW1lbnRzIGFyZSBlcXVhbC5cblx0XHRcdFx0d2hpbGUgKG9yaWdpbmFsSW5kZXggPCBvcmlnaW5hbEVuZCAmJiBtb2RpZmllZEluZGV4IDwgbW9kaWZpZWRFbmQgJiYgdGhpcy5FbGVtZW50c0FyZUVxdWFsKG9yaWdpbmFsSW5kZXggKyAxLCBtb2RpZmllZEluZGV4ICsgMSkpIHtcblx0XHRcdFx0XHRvcmlnaW5hbEluZGV4Kys7XG5cdFx0XHRcdFx0bW9kaWZpZWRJbmRleCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvcndhcmRQb2ludHNbZGlhZ29uYWxdID0gb3JpZ2luYWxJbmRleDtcblxuXHRcdFx0XHRpZiAob3JpZ2luYWxJbmRleCArIG1vZGlmaWVkSW5kZXggPiBmdXJ0aGVzdE9yaWdpbmFsSW5kZXggKyBmdXJ0aGVzdE1vZGlmaWVkSW5kZXgpIHtcblx0XHRcdFx0XHRmdXJ0aGVzdE9yaWdpbmFsSW5kZXggPSBvcmlnaW5hbEluZGV4O1xuXHRcdFx0XHRcdGZ1cnRoZXN0TW9kaWZpZWRJbmRleCA9IG1vZGlmaWVkSW5kZXg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTVEVQIDM6IElmIGRlbHRhIGlzIG9kZCAob3ZlcmxhcCBmaXJzdCBoYXBwZW5zIG9uIGZvcndhcmQgd2hlbiBkZWx0YSBpcyBvZGQpXG5cdFx0XHRcdC8vIGFuZCBkaWFnb25hbCBpcyBpbiB0aGUgcmFuZ2Ugb2YgcmV2ZXJzZSBkaWFnb25hbHMgY29tcHV0ZWQgZm9yIG51bURpZmZlcmVuY2VzLTFcblx0XHRcdFx0Ly8gKHRoZSBwcmV2aW91cyBpdGVyYXRpb247IHdlIGhhdmVuJ3QgY29tcHV0ZWQgcmV2ZXJzZSBkaWFnb25hbHMgZm9yIG51bURpZmZlcmVuY2VzIHlldClcblx0XHRcdFx0Ly8gdGhlbiBjaGVjayBmb3Igb3ZlcmxhcC5cblx0XHRcdFx0aWYgKCFkZWx0YUlzRXZlbiAmJiBNYXRoLmFicyhkaWFnb25hbCAtIGRpYWdvbmFsUmV2ZXJzZUJhc2UpIDw9IChudW1EaWZmZXJlbmNlcyAtIDEpKSB7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggPj0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbF0pIHtcblx0XHRcdFx0XHRcdG1pZE9yaWdpbmFsQXJyWzBdID0gb3JpZ2luYWxJbmRleDtcblx0XHRcdFx0XHRcdG1pZE1vZGlmaWVkQXJyWzBdID0gbW9kaWZpZWRJbmRleDtcblxuXHRcdFx0XHRcdFx0aWYgKHRlbXBPcmlnaW5hbEluZGV4IDw9IHJldmVyc2VQb2ludHNbZGlhZ29uYWxdICYmIExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSA+IDAgJiYgbnVtRGlmZmVyZW5jZXMgPD0gKExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSArIDEpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEJJTkdPISBXZSBvdmVybGFwcGVkLCBhbmQgd2UgaGF2ZSB0aGUgZnVsbCB0cmFjZSBpbiBtZW1vcnkhXG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLldBTEtUUkFDRShkaWFnb25hbEZvcndhcmRCYXNlLCBkaWFnb25hbEZvcndhcmRTdGFydCwgZGlhZ29uYWxGb3J3YXJkRW5kLCBkaWFnb25hbEZvcndhcmRPZmZzZXQsXG5cdFx0XHRcdFx0XHRcdFx0ZGlhZ29uYWxSZXZlcnNlQmFzZSwgZGlhZ29uYWxSZXZlcnNlU3RhcnQsIGRpYWdvbmFsUmV2ZXJzZUVuZCwgZGlhZ29uYWxSZXZlcnNlT2Zmc2V0LFxuXHRcdFx0XHRcdFx0XHRcdGZvcndhcmRQb2ludHMsIHJldmVyc2VQb2ludHMsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxJbmRleCwgb3JpZ2luYWxFbmQsIG1pZE9yaWdpbmFsQXJyLFxuXHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkSW5kZXgsIG1vZGlmaWVkRW5kLCBtaWRNb2RpZmllZEFycixcblx0XHRcdFx0XHRcdFx0XHRkZWx0YUlzRXZlbiwgcXVpdEVhcmx5QXJyXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBFaXRoZXIgZmFsc2Ugb3ZlcmxhcCwgb3Igd2UgZGlkbid0IGhhdmUgZW5vdWdoIG1lbW9yeSBmb3IgdGhlIGZ1bGwgdHJhY2Vcblx0XHRcdFx0XHRcdFx0Ly8gSnVzdCByZXR1cm4gdGhlIHJlY3Vyc2lvbiBwb2ludFxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgdG8gc2VlIGlmIHdlIHNob3VsZCBiZSBxdWl0dGluZyBlYXJseSwgYmVmb3JlIG1vdmluZyBvbiB0byB0aGUgbmV4dCBpdGVyYXRpb24uXG5cdFx0XHRjb25zdCBtYXRjaExlbmd0aE9mTG9uZ2VzdCA9ICgoZnVydGhlc3RPcmlnaW5hbEluZGV4IC0gb3JpZ2luYWxTdGFydCkgKyAoZnVydGhlc3RNb2RpZmllZEluZGV4IC0gbW9kaWZpZWRTdGFydCkgLSBudW1EaWZmZXJlbmNlcykgLyAyO1xuXG5cdFx0XHRpZiAodGhpcy5Db250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGUgIT09IG51bGwgJiYgIXRoaXMuQ29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlKGZ1cnRoZXN0T3JpZ2luYWxJbmRleCwgbWF0Y2hMZW5ndGhPZkxvbmdlc3QpKSB7XG5cdFx0XHRcdC8vIFdlIGNhbid0IGZpbmlzaCwgc28gc2tpcCBhaGVhZCB0byBnZW5lcmF0aW5nIGEgcmVzdWx0IGZyb20gd2hhdCB3ZSBoYXZlLlxuXHRcdFx0XHRxdWl0RWFybHlBcnJbMF0gPSB0cnVlO1xuXG5cdFx0XHRcdC8vIFVzZSB0aGUgZnVydGhlc3QgZGlzdGFuY2Ugd2UgZ290IGluIHRoZSBmb3J3YXJkIGRpcmVjdGlvbi5cblx0XHRcdFx0bWlkT3JpZ2luYWxBcnJbMF0gPSBmdXJ0aGVzdE9yaWdpbmFsSW5kZXg7XG5cdFx0XHRcdG1pZE1vZGlmaWVkQXJyWzBdID0gZnVydGhlc3RNb2RpZmllZEluZGV4O1xuXG5cdFx0XHRcdGlmIChtYXRjaExlbmd0aE9mTG9uZ2VzdCA+IDAgJiYgTG9jYWxDb25zdGFudHMuTWF4RGlmZmVyZW5jZXNIaXN0b3J5ID4gMCAmJiBudW1EaWZmZXJlbmNlcyA8PSAoTG9jYWxDb25zdGFudHMuTWF4RGlmZmVyZW5jZXNIaXN0b3J5ICsgMSkpIHtcblx0XHRcdFx0XHQvLyBFbm91Z2ggb2YgdGhlIGhpc3RvcnkgaXMgaW4gbWVtb3J5IHRvIHdhbGsgaXQgYmFja3dhcmRzXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuV0FMS1RSQUNFKGRpYWdvbmFsRm9yd2FyZEJhc2UsIGRpYWdvbmFsRm9yd2FyZFN0YXJ0LCBkaWFnb25hbEZvcndhcmRFbmQsIGRpYWdvbmFsRm9yd2FyZE9mZnNldCxcblx0XHRcdFx0XHRcdGRpYWdvbmFsUmV2ZXJzZUJhc2UsIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0LCBkaWFnb25hbFJldmVyc2VFbmQsIGRpYWdvbmFsUmV2ZXJzZU9mZnNldCxcblx0XHRcdFx0XHRcdGZvcndhcmRQb2ludHMsIHJldmVyc2VQb2ludHMsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbEluZGV4LCBvcmlnaW5hbEVuZCwgbWlkT3JpZ2luYWxBcnIsXG5cdFx0XHRcdFx0XHRtb2RpZmllZEluZGV4LCBtb2RpZmllZEVuZCwgbWlkTW9kaWZpZWRBcnIsXG5cdFx0XHRcdFx0XHRkZWx0YUlzRXZlbiwgcXVpdEVhcmx5QXJyXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBXZSBkaWRuJ3QgYWN0dWFsbHkgcmVtZW1iZXIgZW5vdWdoIG9mIHRoZSBoaXN0b3J5LlxuXG5cdFx0XHRcdFx0Ly9TaW5jZSB3ZSBhcmUgcXVpdHRpbmcgdGhlIGRpZmYgZWFybHksIHdlIG5lZWQgdG8gc2hpZnQgYmFjayB0aGUgb3JpZ2luYWxTdGFydCBhbmQgbW9kaWZpZWQgc3RhcnRcblx0XHRcdFx0XHQvL2JhY2sgaW50byB0aGUgYm91bmRhcnkgbGltaXRzIHNpbmNlIHdlIGRlY3JlbWVudGVkIHRoZWlyIHZhbHVlIGFib3ZlIGJleW9uZCB0aGUgYm91bmRhcnkgbGltaXQuXG5cdFx0XHRcdFx0b3JpZ2luYWxTdGFydCsrO1xuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnQrKztcblxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHRuZXcgRGlmZkNoYW5nZShvcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbEVuZCAtIG9yaWdpbmFsU3RhcnQgKyAxLFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0LCBtb2RpZmllZEVuZCAtIG1vZGlmaWVkU3RhcnQgKyAxKVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUnVuIHRoZSBhbGdvcml0aG0gaW4gdGhlIHJldmVyc2UgZGlyZWN0aW9uXG5cdFx0XHRkaWFnb25hbFJldmVyc2VTdGFydCA9IHRoaXMuQ2xpcERpYWdvbmFsQm91bmQoZGlhZ29uYWxSZXZlcnNlQmFzZSAtIG51bURpZmZlcmVuY2VzLCBudW1EaWZmZXJlbmNlcywgZGlhZ29uYWxSZXZlcnNlQmFzZSwgbnVtRGlhZ29uYWxzKTtcblx0XHRcdGRpYWdvbmFsUmV2ZXJzZUVuZCA9IHRoaXMuQ2xpcERpYWdvbmFsQm91bmQoZGlhZ29uYWxSZXZlcnNlQmFzZSArIG51bURpZmZlcmVuY2VzLCBudW1EaWZmZXJlbmNlcywgZGlhZ29uYWxSZXZlcnNlQmFzZSwgbnVtRGlhZ29uYWxzKTtcblx0XHRcdGZvciAobGV0IGRpYWdvbmFsID0gZGlhZ29uYWxSZXZlcnNlU3RhcnQ7IGRpYWdvbmFsIDw9IGRpYWdvbmFsUmV2ZXJzZUVuZDsgZGlhZ29uYWwgKz0gMikge1xuXHRcdFx0XHQvLyBTVEVQIDE6IFdlIGV4dGVuZCB0aGUgZnVydGhlc3QgcmVhY2hpbmcgcG9pbnQgaW4gdGhlIHByZXNlbnQgZGlhZ29uYWxcblx0XHRcdFx0Ly8gYnkgbG9va2luZyBhdCB0aGUgZGlhZ29uYWxzIGFib3ZlIGFuZCBiZWxvdyBhbmQgcGlja2luZyB0aGUgb25lIHdob3NlIHBvaW50XG5cdFx0XHRcdC8vIGlzIGZ1cnRoZXIgYXdheSBmcm9tIHRoZSBzdGFydCBwb2ludCAob3JpZ2luYWxFbmQsIG1vZGlmaWVkRW5kKVxuXHRcdFx0XHRpZiAoZGlhZ29uYWwgPT09IGRpYWdvbmFsUmV2ZXJzZVN0YXJ0IHx8IChkaWFnb25hbCA8IGRpYWdvbmFsUmV2ZXJzZUVuZCAmJiByZXZlcnNlUG9pbnRzW2RpYWdvbmFsIC0gMV0gPj0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbCArIDFdKSkge1xuXHRcdFx0XHRcdG9yaWdpbmFsSW5kZXggPSByZXZlcnNlUG9pbnRzW2RpYWdvbmFsICsgMV0gLSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9yaWdpbmFsSW5kZXggPSByZXZlcnNlUG9pbnRzW2RpYWdvbmFsIC0gMV07XG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kaWZpZWRJbmRleCA9IG9yaWdpbmFsSW5kZXggLSAoZGlhZ29uYWwgLSBkaWFnb25hbFJldmVyc2VCYXNlKSAtIGRpYWdvbmFsUmV2ZXJzZU9mZnNldDtcblxuXHRcdFx0XHQvLyBTYXZlIHRoZSBjdXJyZW50IG9yaWdpbmFsSW5kZXggc28gd2UgY2FuIHRlc3QgZm9yIGZhbHNlIG92ZXJsYXBcblx0XHRcdFx0Y29uc3QgdGVtcE9yaWdpbmFsSW5kZXggPSBvcmlnaW5hbEluZGV4O1xuXG5cdFx0XHRcdC8vIFNURVAgMjogV2UgY2FuIGNvbnRpbnVlIHRvIGV4dGVuZCB0aGUgZnVydGhlc3QgcmVhY2hpbmcgcG9pbnQgaW4gdGhlIHByZXNlbnQgZGlhZ29uYWxcblx0XHRcdFx0Ly8gYXMgbG9uZyBhcyB0aGUgZWxlbWVudHMgYXJlIGVxdWFsLlxuXHRcdFx0XHR3aGlsZSAob3JpZ2luYWxJbmRleCA+IG9yaWdpbmFsU3RhcnQgJiYgbW9kaWZpZWRJbmRleCA+IG1vZGlmaWVkU3RhcnQgJiYgdGhpcy5FbGVtZW50c0FyZUVxdWFsKG9yaWdpbmFsSW5kZXgsIG1vZGlmaWVkSW5kZXgpKSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxJbmRleC0tO1xuXHRcdFx0XHRcdG1vZGlmaWVkSW5kZXgtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXZlcnNlUG9pbnRzW2RpYWdvbmFsXSA9IG9yaWdpbmFsSW5kZXg7XG5cblx0XHRcdFx0Ly8gU1RFUCA0OiBJZiBkZWx0YSBpcyBldmVuIChvdmVybGFwIGZpcnN0IGhhcHBlbnMgb24gcmV2ZXJzZSB3aGVuIGRlbHRhIGlzIGV2ZW4pXG5cdFx0XHRcdC8vIGFuZCBkaWFnb25hbCBpcyBpbiB0aGUgcmFuZ2Ugb2YgZm9yd2FyZCBkaWFnb25hbHMgY29tcHV0ZWQgZm9yIG51bURpZmZlcmVuY2VzXG5cdFx0XHRcdC8vIHRoZW4gY2hlY2sgZm9yIG92ZXJsYXAuXG5cdFx0XHRcdGlmIChkZWx0YUlzRXZlbiAmJiBNYXRoLmFicyhkaWFnb25hbCAtIGRpYWdvbmFsRm9yd2FyZEJhc2UpIDw9IG51bURpZmZlcmVuY2VzKSB7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggPD0gZm9yd2FyZFBvaW50c1tkaWFnb25hbF0pIHtcblx0XHRcdFx0XHRcdG1pZE9yaWdpbmFsQXJyWzBdID0gb3JpZ2luYWxJbmRleDtcblx0XHRcdFx0XHRcdG1pZE1vZGlmaWVkQXJyWzBdID0gbW9kaWZpZWRJbmRleDtcblxuXHRcdFx0XHRcdFx0aWYgKHRlbXBPcmlnaW5hbEluZGV4ID49IGZvcndhcmRQb2ludHNbZGlhZ29uYWxdICYmIExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSA+IDAgJiYgbnVtRGlmZmVyZW5jZXMgPD0gKExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSArIDEpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEJJTkdPISBXZSBvdmVybGFwcGVkLCBhbmQgd2UgaGF2ZSB0aGUgZnVsbCB0cmFjZSBpbiBtZW1vcnkhXG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLldBTEtUUkFDRShkaWFnb25hbEZvcndhcmRCYXNlLCBkaWFnb25hbEZvcndhcmRTdGFydCwgZGlhZ29uYWxGb3J3YXJkRW5kLCBkaWFnb25hbEZvcndhcmRPZmZzZXQsXG5cdFx0XHRcdFx0XHRcdFx0ZGlhZ29uYWxSZXZlcnNlQmFzZSwgZGlhZ29uYWxSZXZlcnNlU3RhcnQsIGRpYWdvbmFsUmV2ZXJzZUVuZCwgZGlhZ29uYWxSZXZlcnNlT2Zmc2V0LFxuXHRcdFx0XHRcdFx0XHRcdGZvcndhcmRQb2ludHMsIHJldmVyc2VQb2ludHMsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxJbmRleCwgb3JpZ2luYWxFbmQsIG1pZE9yaWdpbmFsQXJyLFxuXHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkSW5kZXgsIG1vZGlmaWVkRW5kLCBtaWRNb2RpZmllZEFycixcblx0XHRcdFx0XHRcdFx0XHRkZWx0YUlzRXZlbiwgcXVpdEVhcmx5QXJyXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBFaXRoZXIgZmFsc2Ugb3ZlcmxhcCwgb3Igd2UgZGlkbid0IGhhdmUgZW5vdWdoIG1lbW9yeSBmb3IgdGhlIGZ1bGwgdHJhY2Vcblx0XHRcdFx0XHRcdFx0Ly8gSnVzdCByZXR1cm4gdGhlIHJlY3Vyc2lvbiBwb2ludFxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU2F2ZSBjdXJyZW50IHZlY3RvcnMgdG8gaGlzdG9yeSBiZWZvcmUgdGhlIG5leHQgaXRlcmF0aW9uXG5cdFx0XHRpZiAobnVtRGlmZmVyZW5jZXMgPD0gTG9jYWxDb25zdGFudHMuTWF4RGlmZmVyZW5jZXNIaXN0b3J5KSB7XG5cdFx0XHRcdC8vIFdlIGFyZSBhbGxvY2F0aW5nIHNwYWNlIGZvciBvbmUgZXh0cmEgaW50LCB3aGljaCB3ZSBmaWxsIHdpdGhcblx0XHRcdFx0Ly8gdGhlIGluZGV4IG9mIHRoZSBkaWFnb25hbCBiYXNlIGluZGV4XG5cdFx0XHRcdGxldCB0ZW1wID0gbmV3IEludDMyQXJyYXkoZGlhZ29uYWxGb3J3YXJkRW5kIC0gZGlhZ29uYWxGb3J3YXJkU3RhcnQgKyAyKTtcblx0XHRcdFx0dGVtcFswXSA9IGRpYWdvbmFsRm9yd2FyZEJhc2UgLSBkaWFnb25hbEZvcndhcmRTdGFydCArIDE7XG5cdFx0XHRcdE15QXJyYXkuQ29weTIoZm9yd2FyZFBvaW50cywgZGlhZ29uYWxGb3J3YXJkU3RhcnQsIHRlbXAsIDEsIGRpYWdvbmFsRm9yd2FyZEVuZCAtIGRpYWdvbmFsRm9yd2FyZFN0YXJ0ICsgMSk7XG5cdFx0XHRcdHRoaXMubV9mb3J3YXJkSGlzdG9yeS5wdXNoKHRlbXApO1xuXG5cdFx0XHRcdHRlbXAgPSBuZXcgSW50MzJBcnJheShkaWFnb25hbFJldmVyc2VFbmQgLSBkaWFnb25hbFJldmVyc2VTdGFydCArIDIpO1xuXHRcdFx0XHR0ZW1wWzBdID0gZGlhZ29uYWxSZXZlcnNlQmFzZSAtIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0ICsgMTtcblx0XHRcdFx0TXlBcnJheS5Db3B5MihyZXZlcnNlUG9pbnRzLCBkaWFnb25hbFJldmVyc2VTdGFydCwgdGVtcCwgMSwgZGlhZ29uYWxSZXZlcnNlRW5kIC0gZGlhZ29uYWxSZXZlcnNlU3RhcnQgKyAxKTtcblx0XHRcdFx0dGhpcy5tX3JldmVyc2VIaXN0b3J5LnB1c2godGVtcCk7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBnb3QgaGVyZSwgdGhlbiB3ZSBoYXZlIHRoZSBmdWxsIHRyYWNlIGluIGhpc3RvcnkuIFdlIGp1c3QgaGF2ZSB0byBjb252ZXJ0IGl0IHRvIGEgY2hhbmdlIGxpc3Rcblx0XHQvLyBOT1RFOiBUaGlzIHBhcnQgaXMgYSBiaXQgbWVzc3lcblx0XHRyZXR1cm4gdGhpcy5XQUxLVFJBQ0UoZGlhZ29uYWxGb3J3YXJkQmFzZSwgZGlhZ29uYWxGb3J3YXJkU3RhcnQsIGRpYWdvbmFsRm9yd2FyZEVuZCwgZGlhZ29uYWxGb3J3YXJkT2Zmc2V0LFxuXHRcdFx0ZGlhZ29uYWxSZXZlcnNlQmFzZSwgZGlhZ29uYWxSZXZlcnNlU3RhcnQsIGRpYWdvbmFsUmV2ZXJzZUVuZCwgZGlhZ29uYWxSZXZlcnNlT2Zmc2V0LFxuXHRcdFx0Zm9yd2FyZFBvaW50cywgcmV2ZXJzZVBvaW50cyxcblx0XHRcdG9yaWdpbmFsSW5kZXgsIG9yaWdpbmFsRW5kLCBtaWRPcmlnaW5hbEFycixcblx0XHRcdG1vZGlmaWVkSW5kZXgsIG1vZGlmaWVkRW5kLCBtaWRNb2RpZmllZEFycixcblx0XHRcdGRlbHRhSXNFdmVuLCBxdWl0RWFybHlBcnJcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNoaWZ0cyB0aGUgZ2l2ZW4gY2hhbmdlcyB0byBwcm92aWRlIGEgbW9yZSBpbnR1aXRpdmUgZGlmZi5cblx0ICogV2hpbGUgdGhlIGZpcnN0IGVsZW1lbnQgaW4gYSBkaWZmIG1hdGNoZXMgdGhlIGZpcnN0IGVsZW1lbnQgYWZ0ZXIgdGhlIGRpZmYsXG5cdCAqIHdlIHNoaWZ0IHRoZSBkaWZmIGRvd24uXG5cdCAqXG5cdCAqIEBwYXJhbSBjaGFuZ2VzIFRoZSBsaXN0IG9mIGNoYW5nZXMgdG8gc2hpZnRcblx0ICogQHJldHVybnMgVGhlIHNoaWZ0ZWQgY2hhbmdlc1xuXHQgKi9cblx0cHJpdmF0ZSBQcmV0dGlmeUNoYW5nZXMoY2hhbmdlczogRGlmZkNoYW5nZVtdKTogRGlmZkNoYW5nZVtdIHtcblxuXHRcdC8vIFNoaWZ0IGFsbCB0aGUgY2hhbmdlcyBkb3duIGZpcnN0XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTdG9wID0gKGkgPCBjaGFuZ2VzLmxlbmd0aCAtIDEpID8gY2hhbmdlc1tpICsgMV0ub3JpZ2luYWxTdGFydCA6IHRoaXMuX29yaWdpbmFsRWxlbWVudHNPckhhc2gubGVuZ3RoO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRTdG9wID0gKGkgPCBjaGFuZ2VzLmxlbmd0aCAtIDEpID8gY2hhbmdlc1tpICsgMV0ubW9kaWZpZWRTdGFydCA6IHRoaXMuX21vZGlmaWVkRWxlbWVudHNPckhhc2gubGVuZ3RoO1xuXHRcdFx0Y29uc3QgY2hlY2tPcmlnaW5hbCA9IGNoYW5nZS5vcmlnaW5hbExlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCBjaGVja01vZGlmaWVkID0gY2hhbmdlLm1vZGlmaWVkTGVuZ3RoID4gMDtcblxuXHRcdFx0d2hpbGUgKFxuXHRcdFx0XHRjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCA8IG9yaWdpbmFsU3RvcFxuXHRcdFx0XHQmJiBjaGFuZ2UubW9kaWZpZWRTdGFydCArIGNoYW5nZS5tb2RpZmllZExlbmd0aCA8IG1vZGlmaWVkU3RvcFxuXHRcdFx0XHQmJiAoIWNoZWNrT3JpZ2luYWwgfHwgdGhpcy5PcmlnaW5hbEVsZW1lbnRzQXJlRXF1YWwoY2hhbmdlLm9yaWdpbmFsU3RhcnQsIGNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoKSlcblx0XHRcdFx0JiYgKCFjaGVja01vZGlmaWVkIHx8IHRoaXMuTW9kaWZpZWRFbGVtZW50c0FyZUVxdWFsKGNoYW5nZS5tb2RpZmllZFN0YXJ0LCBjaGFuZ2UubW9kaWZpZWRTdGFydCArIGNoYW5nZS5tb2RpZmllZExlbmd0aCkpXG5cdFx0XHQpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnRTdHJpY3RFcXVhbCA9IHRoaXMuRWxlbWVudHNBcmVTdHJpY3RFcXVhbChjaGFuZ2Uub3JpZ2luYWxTdGFydCwgY2hhbmdlLm1vZGlmaWVkU3RhcnQpO1xuXHRcdFx0XHRjb25zdCBlbmRTdHJpY3RFcXVhbCA9IHRoaXMuRWxlbWVudHNBcmVTdHJpY3RFcXVhbChjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCwgY2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpO1xuXHRcdFx0XHRpZiAoZW5kU3RyaWN0RXF1YWwgJiYgIXN0YXJ0U3RyaWN0RXF1YWwpIHtcblx0XHRcdFx0XHQvLyBtb3ZpbmcgdGhlIGNoYW5nZSBkb3duIHdvdWxkIGNyZWF0ZSBhbiBlcXVhbCBjaGFuZ2UsIGJ1dCB0aGUgZWxlbWVudHMgYXJlIG5vdCBzdHJpY3QgZXF1YWxcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjaGFuZ2Uub3JpZ2luYWxTdGFydCsrO1xuXHRcdFx0XHRjaGFuZ2UubW9kaWZpZWRTdGFydCsrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXJnZWRDaGFuZ2VBcnI6IEFycmF5PERpZmZDaGFuZ2UgfCBudWxsPiA9IFtudWxsXTtcblx0XHRcdGlmIChpIDwgY2hhbmdlcy5sZW5ndGggLSAxICYmIHRoaXMuQ2hhbmdlc092ZXJsYXAoY2hhbmdlc1tpXSwgY2hhbmdlc1tpICsgMV0sIG1lcmdlZENoYW5nZUFycikpIHtcblx0XHRcdFx0Y2hhbmdlc1tpXSA9IG1lcmdlZENoYW5nZUFyclswXSE7XG5cdFx0XHRcdGNoYW5nZXMuc3BsaWNlKGkgKyAxLCAxKTtcblx0XHRcdFx0aS0tO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaGlmdCBjaGFuZ2VzIGJhY2sgdXAgdW50aWwgd2UgaGl0IGVtcHR5IG9yIHdoaXRlc3BhY2Utb25seSBsaW5lc1xuXHRcdGZvciAobGV0IGkgPSBjaGFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuXG5cdFx0XHRsZXQgb3JpZ2luYWxTdG9wID0gMDtcblx0XHRcdGxldCBtb2RpZmllZFN0b3AgPSAwO1xuXHRcdFx0aWYgKGkgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZDaGFuZ2UgPSBjaGFuZ2VzW2kgLSAxXTtcblx0XHRcdFx0b3JpZ2luYWxTdG9wID0gcHJldkNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgcHJldkNoYW5nZS5vcmlnaW5hbExlbmd0aDtcblx0XHRcdFx0bW9kaWZpZWRTdG9wID0gcHJldkNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgcHJldkNoYW5nZS5tb2RpZmllZExlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hlY2tPcmlnaW5hbCA9IGNoYW5nZS5vcmlnaW5hbExlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCBjaGVja01vZGlmaWVkID0gY2hhbmdlLm1vZGlmaWVkTGVuZ3RoID4gMDtcblxuXHRcdFx0bGV0IGJlc3REZWx0YSA9IDA7XG5cdFx0XHRsZXQgYmVzdFNjb3JlID0gdGhpcy5fYm91bmRhcnlTY29yZShjaGFuZ2Uub3JpZ2luYWxTdGFydCwgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoLCBjaGFuZ2UubW9kaWZpZWRTdGFydCwgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoKTtcblxuXHRcdFx0Zm9yIChsZXQgZGVsdGEgPSAxOyA7IGRlbHRhKyspIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxTdGFydCA9IGNoYW5nZS5vcmlnaW5hbFN0YXJ0IC0gZGVsdGE7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkU3RhcnQgPSBjaGFuZ2UubW9kaWZpZWRTdGFydCAtIGRlbHRhO1xuXG5cdFx0XHRcdGlmIChvcmlnaW5hbFN0YXJ0IDwgb3JpZ2luYWxTdG9wIHx8IG1vZGlmaWVkU3RhcnQgPCBtb2RpZmllZFN0b3ApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaGVja09yaWdpbmFsICYmICF0aGlzLk9yaWdpbmFsRWxlbWVudHNBcmVFcXVhbChvcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbFN0YXJ0ICsgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNoZWNrTW9kaWZpZWQgJiYgIXRoaXMuTW9kaWZpZWRFbGVtZW50c0FyZUVxdWFsKG1vZGlmaWVkU3RhcnQsIG1vZGlmaWVkU3RhcnQgKyBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0b3VjaGluZ1ByZXZpb3VzQ2hhbmdlID0gKG9yaWdpbmFsU3RhcnQgPT09IG9yaWdpbmFsU3RvcCAmJiBtb2RpZmllZFN0YXJ0ID09PSBtb2RpZmllZFN0b3ApO1xuXHRcdFx0XHRjb25zdCBzY29yZSA9IChcblx0XHRcdFx0XHQodG91Y2hpbmdQcmV2aW91c0NoYW5nZSA/IDUgOiAwKVxuXHRcdFx0XHRcdCsgdGhpcy5fYm91bmRhcnlTY29yZShvcmlnaW5hbFN0YXJ0LCBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsIG1vZGlmaWVkU3RhcnQsIGNoYW5nZS5tb2RpZmllZExlbmd0aClcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAoc2NvcmUgPiBiZXN0U2NvcmUpIHtcblx0XHRcdFx0XHRiZXN0U2NvcmUgPSBzY29yZTtcblx0XHRcdFx0XHRiZXN0RGVsdGEgPSBkZWx0YTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjaGFuZ2Uub3JpZ2luYWxTdGFydCAtPSBiZXN0RGVsdGE7XG5cdFx0XHRjaGFuZ2UubW9kaWZpZWRTdGFydCAtPSBiZXN0RGVsdGE7XG5cblx0XHRcdGNvbnN0IG1lcmdlZENoYW5nZUFycjogQXJyYXk8RGlmZkNoYW5nZSB8IG51bGw+ID0gW251bGxdO1xuXHRcdFx0aWYgKGkgPiAwICYmIHRoaXMuQ2hhbmdlc092ZXJsYXAoY2hhbmdlc1tpIC0gMV0sIGNoYW5nZXNbaV0sIG1lcmdlZENoYW5nZUFycikpIHtcblx0XHRcdFx0Y2hhbmdlc1tpIC0gMV0gPSBtZXJnZWRDaGFuZ2VBcnJbMF0hO1xuXHRcdFx0XHRjaGFuZ2VzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0aSsrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUaGVyZSBjb3VsZCBiZSBtdWx0aXBsZSBsb25nZXN0IGNvbW1vbiBzdWJzdHJpbmdzLlxuXHRcdC8vIEdpdmUgcHJlZmVyZW5jZSB0byB0aGUgb25lcyBjb250YWluaW5nIGxvbmdlciBsaW5lc1xuXHRcdGlmICh0aGlzLl9oYXNTdHJpbmdzKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMSwgbGVuID0gY2hhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBhQ2hhbmdlID0gY2hhbmdlc1tpIC0gMV07XG5cdFx0XHRcdGNvbnN0IGJDaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuXHRcdFx0XHRjb25zdCBtYXRjaGVkTGVuZ3RoID0gYkNoYW5nZS5vcmlnaW5hbFN0YXJ0IC0gYUNoYW5nZS5vcmlnaW5hbFN0YXJ0IC0gYUNoYW5nZS5vcmlnaW5hbExlbmd0aDtcblx0XHRcdFx0Y29uc3QgYU9yaWdpbmFsU3RhcnQgPSBhQ2hhbmdlLm9yaWdpbmFsU3RhcnQ7XG5cdFx0XHRcdGNvbnN0IGJPcmlnaW5hbEVuZCA9IGJDaGFuZ2Uub3JpZ2luYWxTdGFydCArIGJDaGFuZ2Uub3JpZ2luYWxMZW5ndGg7XG5cdFx0XHRcdGNvbnN0IGFiT3JpZ2luYWxMZW5ndGggPSBiT3JpZ2luYWxFbmQgLSBhT3JpZ2luYWxTdGFydDtcblx0XHRcdFx0Y29uc3QgYU1vZGlmaWVkU3RhcnQgPSBhQ2hhbmdlLm1vZGlmaWVkU3RhcnQ7XG5cdFx0XHRcdGNvbnN0IGJNb2RpZmllZEVuZCA9IGJDaGFuZ2UubW9kaWZpZWRTdGFydCArIGJDaGFuZ2UubW9kaWZpZWRMZW5ndGg7XG5cdFx0XHRcdGNvbnN0IGFiTW9kaWZpZWRMZW5ndGggPSBiTW9kaWZpZWRFbmQgLSBhTW9kaWZpZWRTdGFydDtcblx0XHRcdFx0Ly8gQXZvaWQgd2FzdGluZyBhIGxvdCBvZiB0aW1lIHdpdGggdGhlc2Ugc2VhcmNoZXNcblx0XHRcdFx0aWYgKG1hdGNoZWRMZW5ndGggPCA1ICYmIGFiT3JpZ2luYWxMZW5ndGggPCAyMCAmJiBhYk1vZGlmaWVkTGVuZ3RoIDwgMjApIHtcblx0XHRcdFx0XHRjb25zdCB0ID0gdGhpcy5fZmluZEJldHRlckNvbnRpZ3VvdXNTZXF1ZW5jZShcblx0XHRcdFx0XHRcdGFPcmlnaW5hbFN0YXJ0LCBhYk9yaWdpbmFsTGVuZ3RoLFxuXHRcdFx0XHRcdFx0YU1vZGlmaWVkU3RhcnQsIGFiTW9kaWZpZWRMZW5ndGgsXG5cdFx0XHRcdFx0XHRtYXRjaGVkTGVuZ3RoXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAodCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgW29yaWdpbmFsTWF0Y2hTdGFydCwgbW9kaWZpZWRNYXRjaFN0YXJ0XSA9IHQ7XG5cdFx0XHRcdFx0XHRpZiAob3JpZ2luYWxNYXRjaFN0YXJ0ICE9PSBhQ2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBhQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoIHx8IG1vZGlmaWVkTWF0Y2hTdGFydCAhPT0gYUNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgYUNoYW5nZS5tb2RpZmllZExlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHQvLyBzd2l0Y2ggdG8gYW5vdGhlciBzZXF1ZW5jZSB0aGF0IGhhcyBhIGJldHRlciBzY29yZVxuXHRcdFx0XHRcdFx0XHRhQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoID0gb3JpZ2luYWxNYXRjaFN0YXJ0IC0gYUNoYW5nZS5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0XHRcdFx0XHRhQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoID0gbW9kaWZpZWRNYXRjaFN0YXJ0IC0gYUNoYW5nZS5tb2RpZmllZFN0YXJ0O1xuXHRcdFx0XHRcdFx0XHRiQ2hhbmdlLm9yaWdpbmFsU3RhcnQgPSBvcmlnaW5hbE1hdGNoU3RhcnQgKyBtYXRjaGVkTGVuZ3RoO1xuXHRcdFx0XHRcdFx0XHRiQ2hhbmdlLm1vZGlmaWVkU3RhcnQgPSBtb2RpZmllZE1hdGNoU3RhcnQgKyBtYXRjaGVkTGVuZ3RoO1xuXHRcdFx0XHRcdFx0XHRiQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoID0gYk9yaWdpbmFsRW5kIC0gYkNoYW5nZS5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0XHRcdFx0XHRiQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoID0gYk1vZGlmaWVkRW5kIC0gYkNoYW5nZS5tb2RpZmllZFN0YXJ0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjaGFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEJldHRlckNvbnRpZ3VvdXNTZXF1ZW5jZShvcmlnaW5hbFN0YXJ0OiBudW1iZXIsIG9yaWdpbmFsTGVuZ3RoOiBudW1iZXIsIG1vZGlmaWVkU3RhcnQ6IG51bWJlciwgbW9kaWZpZWRMZW5ndGg6IG51bWJlciwgZGVzaXJlZExlbmd0aDogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB8IG51bGwge1xuXHRcdGlmIChvcmlnaW5hbExlbmd0aCA8IGRlc2lyZWRMZW5ndGggfHwgbW9kaWZpZWRMZW5ndGggPCBkZXNpcmVkTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgb3JpZ2luYWxNYXggPSBvcmlnaW5hbFN0YXJ0ICsgb3JpZ2luYWxMZW5ndGggLSBkZXNpcmVkTGVuZ3RoICsgMTtcblx0XHRjb25zdCBtb2RpZmllZE1heCA9IG1vZGlmaWVkU3RhcnQgKyBtb2RpZmllZExlbmd0aCAtIGRlc2lyZWRMZW5ndGggKyAxO1xuXHRcdGxldCBiZXN0U2NvcmUgPSAwO1xuXHRcdGxldCBiZXN0T3JpZ2luYWxTdGFydCA9IDA7XG5cdFx0bGV0IGJlc3RNb2RpZmllZFN0YXJ0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gb3JpZ2luYWxTdGFydDsgaSA8IG9yaWdpbmFsTWF4OyBpKyspIHtcblx0XHRcdGZvciAobGV0IGogPSBtb2RpZmllZFN0YXJ0OyBqIDwgbW9kaWZpZWRNYXg7IGorKykge1xuXHRcdFx0XHRjb25zdCBzY29yZSA9IHRoaXMuX2NvbnRpZ3VvdXNTZXF1ZW5jZVNjb3JlKGksIGosIGRlc2lyZWRMZW5ndGgpO1xuXHRcdFx0XHRpZiAoc2NvcmUgPiAwICYmIHNjb3JlID4gYmVzdFNjb3JlKSB7XG5cdFx0XHRcdFx0YmVzdFNjb3JlID0gc2NvcmU7XG5cdFx0XHRcdFx0YmVzdE9yaWdpbmFsU3RhcnQgPSBpO1xuXHRcdFx0XHRcdGJlc3RNb2RpZmllZFN0YXJ0ID0gajtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYmVzdFNjb3JlID4gMCkge1xuXHRcdFx0cmV0dXJuIFtiZXN0T3JpZ2luYWxTdGFydCwgYmVzdE1vZGlmaWVkU3RhcnRdO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRpZ3VvdXNTZXF1ZW5jZVNjb3JlKG9yaWdpbmFsU3RhcnQ6IG51bWJlciwgbW9kaWZpZWRTdGFydDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IHNjb3JlID0gMDtcblx0XHRmb3IgKGxldCBsID0gMDsgbCA8IGxlbmd0aDsgbCsrKSB7XG5cdFx0XHRpZiAoIXRoaXMuRWxlbWVudHNBcmVFcXVhbChvcmlnaW5hbFN0YXJ0ICsgbCwgbW9kaWZpZWRTdGFydCArIGwpKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdFx0c2NvcmUgKz0gdGhpcy5fb3JpZ2luYWxTdHJpbmdFbGVtZW50c1tvcmlnaW5hbFN0YXJ0ICsgbF0ubGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gc2NvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9PcmlnaW5hbElzQm91bmRhcnkoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmIChpbmRleCA8PSAwIHx8IGluZGV4ID49IHRoaXMuX29yaWdpbmFsRWxlbWVudHNPckhhc2gubGVuZ3RoIC0gMSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAodGhpcy5faGFzU3RyaW5ncyAmJiAvXlxccyokLy50ZXN0KHRoaXMuX29yaWdpbmFsU3RyaW5nRWxlbWVudHNbaW5kZXhdKSk7XG5cdH1cblxuXHRwcml2YXRlIF9PcmlnaW5hbFJlZ2lvbklzQm91bmRhcnkob3JpZ2luYWxTdGFydDogbnVtYmVyLCBvcmlnaW5hbExlbmd0aDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX09yaWdpbmFsSXNCb3VuZGFyeShvcmlnaW5hbFN0YXJ0KSB8fCB0aGlzLl9PcmlnaW5hbElzQm91bmRhcnkob3JpZ2luYWxTdGFydCAtIDEpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKG9yaWdpbmFsTGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxFbmQgPSBvcmlnaW5hbFN0YXJ0ICsgb3JpZ2luYWxMZW5ndGg7XG5cdFx0XHRpZiAodGhpcy5fT3JpZ2luYWxJc0JvdW5kYXJ5KG9yaWdpbmFsRW5kIC0gMSkgfHwgdGhpcy5fT3JpZ2luYWxJc0JvdW5kYXJ5KG9yaWdpbmFsRW5kKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfTW9kaWZpZWRJc0JvdW5kYXJ5KGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoaW5kZXggPD0gMCB8fCBpbmRleCA+PSB0aGlzLl9tb2RpZmllZEVsZW1lbnRzT3JIYXNoLmxlbmd0aCAtIDEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHRoaXMuX2hhc1N0cmluZ3MgJiYgL15cXHMqJC8udGVzdCh0aGlzLl9tb2RpZmllZFN0cmluZ0VsZW1lbnRzW2luZGV4XSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfTW9kaWZpZWRSZWdpb25Jc0JvdW5kYXJ5KG1vZGlmaWVkU3RhcnQ6IG51bWJlciwgbW9kaWZpZWRMZW5ndGg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9Nb2RpZmllZElzQm91bmRhcnkobW9kaWZpZWRTdGFydCkgfHwgdGhpcy5fTW9kaWZpZWRJc0JvdW5kYXJ5KG1vZGlmaWVkU3RhcnQgLSAxKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChtb2RpZmllZExlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG1vZGlmaWVkRW5kID0gbW9kaWZpZWRTdGFydCArIG1vZGlmaWVkTGVuZ3RoO1xuXHRcdFx0aWYgKHRoaXMuX01vZGlmaWVkSXNCb3VuZGFyeShtb2RpZmllZEVuZCAtIDEpIHx8IHRoaXMuX01vZGlmaWVkSXNCb3VuZGFyeShtb2RpZmllZEVuZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2JvdW5kYXJ5U2NvcmUob3JpZ2luYWxTdGFydDogbnVtYmVyLCBvcmlnaW5hbExlbmd0aDogbnVtYmVyLCBtb2RpZmllZFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkTGVuZ3RoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IG9yaWdpbmFsU2NvcmUgPSAodGhpcy5fT3JpZ2luYWxSZWdpb25Jc0JvdW5kYXJ5KG9yaWdpbmFsU3RhcnQsIG9yaWdpbmFsTGVuZ3RoKSA/IDEgOiAwKTtcblx0XHRjb25zdCBtb2RpZmllZFNjb3JlID0gKHRoaXMuX01vZGlmaWVkUmVnaW9uSXNCb3VuZGFyeShtb2RpZmllZFN0YXJ0LCBtb2RpZmllZExlbmd0aCkgPyAxIDogMCk7XG5cdFx0cmV0dXJuIChvcmlnaW5hbFNjb3JlICsgbW9kaWZpZWRTY29yZSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29uY2F0ZW5hdGVzIHRoZSB0d28gaW5wdXQgRGlmZkNoYW5nZSBsaXN0cyBhbmQgcmV0dXJucyB0aGUgcmVzdWx0aW5nXG5cdCAqIGxpc3QuXG5cdCAqIEBwYXJhbSBUaGUgbGVmdCBjaGFuZ2VzXG5cdCAqIEBwYXJhbSBUaGUgcmlnaHQgY2hhbmdlc1xuXHQgKiBAcmV0dXJucyBUaGUgY29uY2F0ZW5hdGVkIGxpc3Rcblx0ICovXG5cdHByaXZhdGUgQ29uY2F0ZW5hdGVDaGFuZ2VzKGxlZnQ6IERpZmZDaGFuZ2VbXSwgcmlnaHQ6IERpZmZDaGFuZ2VbXSk6IERpZmZDaGFuZ2VbXSB7XG5cdFx0Y29uc3QgbWVyZ2VkQ2hhbmdlQXJyOiBEaWZmQ2hhbmdlW10gPSBbXTtcblxuXHRcdGlmIChsZWZ0Lmxlbmd0aCA9PT0gMCB8fCByaWdodC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAocmlnaHQubGVuZ3RoID4gMCkgPyByaWdodCA6IGxlZnQ7XG5cdFx0fSBlbHNlIGlmICh0aGlzLkNoYW5nZXNPdmVybGFwKGxlZnRbbGVmdC5sZW5ndGggLSAxXSwgcmlnaHRbMF0sIG1lcmdlZENoYW5nZUFycikpIHtcblx0XHRcdC8vIFNpbmNlIHdlIGJyZWFrIHRoZSBwcm9ibGVtIGRvd24gcmVjdXJzaXZlbHksIGl0IGlzIHBvc3NpYmxlIHRoYXQgd2Vcblx0XHRcdC8vIG1pZ2h0IHJlY3Vyc2UgaW4gdGhlIG1pZGRsZSBvZiBhIGNoYW5nZSB0aGVyZWJ5IHNwbGl0dGluZyBpdCBpbnRvXG5cdFx0XHQvLyB0d28gY2hhbmdlcy4gSGVyZSBpbiB0aGUgY29tYmluaW5nIHN0YWdlLCB3ZSBkZXRlY3QgYW5kIGZ1c2UgdGhvc2Vcblx0XHRcdC8vIGNoYW5nZXMgYmFjayB0b2dldGhlclxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PERpZmZDaGFuZ2U+KGxlZnQubGVuZ3RoICsgcmlnaHQubGVuZ3RoIC0gMSk7XG5cdFx0XHRNeUFycmF5LkNvcHkobGVmdCwgMCwgcmVzdWx0LCAwLCBsZWZ0Lmxlbmd0aCAtIDEpO1xuXHRcdFx0cmVzdWx0W2xlZnQubGVuZ3RoIC0gMV0gPSBtZXJnZWRDaGFuZ2VBcnJbMF07XG5cdFx0XHRNeUFycmF5LkNvcHkocmlnaHQsIDEsIHJlc3VsdCwgbGVmdC5sZW5ndGgsIHJpZ2h0Lmxlbmd0aCAtIDEpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8RGlmZkNoYW5nZT4obGVmdC5sZW5ndGggKyByaWdodC5sZW5ndGgpO1xuXHRcdFx0TXlBcnJheS5Db3B5KGxlZnQsIDAsIHJlc3VsdCwgMCwgbGVmdC5sZW5ndGgpO1xuXHRcdFx0TXlBcnJheS5Db3B5KHJpZ2h0LCAwLCByZXN1bHQsIGxlZnQubGVuZ3RoLCByaWdodC5sZW5ndGgpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHR3byBjaGFuZ2VzIG92ZXJsYXAgYW5kIGNhbiBiZSBtZXJnZWQgaW50byBhIHNpbmdsZVxuXHQgKiBjaGFuZ2Vcblx0ICogQHBhcmFtIGxlZnQgVGhlIGxlZnQgY2hhbmdlXG5cdCAqIEBwYXJhbSByaWdodCBUaGUgcmlnaHQgY2hhbmdlXG5cdCAqIEBwYXJhbSBtZXJnZWRDaGFuZ2UgVGhlIG1lcmdlZCBjaGFuZ2UgaWYgdGhlIHR3byBvdmVybGFwLCBudWxsIG90aGVyd2lzZVxuXHQgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSB0d28gY2hhbmdlcyBvdmVybGFwXG5cdCAqL1xuXHRwcml2YXRlIENoYW5nZXNPdmVybGFwKGxlZnQ6IERpZmZDaGFuZ2UsIHJpZ2h0OiBEaWZmQ2hhbmdlLCBtZXJnZWRDaGFuZ2VBcnI6IEFycmF5PERpZmZDaGFuZ2UgfCBudWxsPik6IGJvb2xlYW4ge1xuXHRcdERlYnVnLkFzc2VydChsZWZ0Lm9yaWdpbmFsU3RhcnQgPD0gcmlnaHQub3JpZ2luYWxTdGFydCwgJ0xlZnQgY2hhbmdlIGlzIG5vdCBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gcmlnaHQgY2hhbmdlJyk7XG5cdFx0RGVidWcuQXNzZXJ0KGxlZnQubW9kaWZpZWRTdGFydCA8PSByaWdodC5tb2RpZmllZFN0YXJ0LCAnTGVmdCBjaGFuZ2UgaXMgbm90IGxlc3MgdGhhbiBvciBlcXVhbCB0byByaWdodCBjaGFuZ2UnKTtcblxuXHRcdGlmIChsZWZ0Lm9yaWdpbmFsU3RhcnQgKyBsZWZ0Lm9yaWdpbmFsTGVuZ3RoID49IHJpZ2h0Lm9yaWdpbmFsU3RhcnQgfHwgbGVmdC5tb2RpZmllZFN0YXJ0ICsgbGVmdC5tb2RpZmllZExlbmd0aCA+PSByaWdodC5tb2RpZmllZFN0YXJ0KSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFN0YXJ0ID0gbGVmdC5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0bGV0IG9yaWdpbmFsTGVuZ3RoID0gbGVmdC5vcmlnaW5hbExlbmd0aDtcblx0XHRcdGNvbnN0IG1vZGlmaWVkU3RhcnQgPSBsZWZ0Lm1vZGlmaWVkU3RhcnQ7XG5cdFx0XHRsZXQgbW9kaWZpZWRMZW5ndGggPSBsZWZ0Lm1vZGlmaWVkTGVuZ3RoO1xuXG5cdFx0XHRpZiAobGVmdC5vcmlnaW5hbFN0YXJ0ICsgbGVmdC5vcmlnaW5hbExlbmd0aCA+PSByaWdodC5vcmlnaW5hbFN0YXJ0KSB7XG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoID0gcmlnaHQub3JpZ2luYWxTdGFydCArIHJpZ2h0Lm9yaWdpbmFsTGVuZ3RoIC0gbGVmdC5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxlZnQubW9kaWZpZWRTdGFydCArIGxlZnQubW9kaWZpZWRMZW5ndGggPj0gcmlnaHQubW9kaWZpZWRTdGFydCkge1xuXHRcdFx0XHRtb2RpZmllZExlbmd0aCA9IHJpZ2h0Lm1vZGlmaWVkU3RhcnQgKyByaWdodC5tb2RpZmllZExlbmd0aCAtIGxlZnQubW9kaWZpZWRTdGFydDtcblx0XHRcdH1cblxuXHRcdFx0bWVyZ2VkQ2hhbmdlQXJyWzBdID0gbmV3IERpZmZDaGFuZ2Uob3JpZ2luYWxTdGFydCwgb3JpZ2luYWxMZW5ndGgsIG1vZGlmaWVkU3RhcnQsIG1vZGlmaWVkTGVuZ3RoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXJnZWRDaGFuZ2VBcnJbMF0gPSBudWxsO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIZWxwZXIgbWV0aG9kIHVzZWQgdG8gY2xpcCBhIGRpYWdvbmFsIGluZGV4IHRvIHRoZSByYW5nZSBvZiB2YWxpZFxuXHQgKiBkaWFnb25hbHMuIFRoaXMgYWxzbyBkZWNpZGVzIHdoZXRoZXIgb3Igbm90IHRoZSBkaWFnb25hbCBpbmRleCxcblx0ICogaWYgaXQgZXhjZWVkcyB0aGUgYm91bmRhcnksIHNob3VsZCBiZSBjbGlwcGVkIHRvIHRoZSBib3VuZGFyeSBvciBjbGlwcGVkXG5cdCAqIG9uZSBpbnNpZGUgdGhlIGJvdW5kYXJ5IGRlcGVuZGluZyBvbiB0aGUgRXZlbi9PZGQgc3RhdHVzIG9mIHRoZSBib3VuZGFyeVxuXHQgKiBhbmQgbnVtRGlmZmVyZW5jZXMuXG5cdCAqIEBwYXJhbSBkaWFnb25hbCBUaGUgaW5kZXggb2YgdGhlIGRpYWdvbmFsIHRvIGNsaXAuXG5cdCAqIEBwYXJhbSBudW1EaWZmZXJlbmNlcyBUaGUgY3VycmVudCBudW1iZXIgb2YgZGlmZmVyZW5jZXMgYmVpbmcgaXRlcmF0ZWQgdXBvbi5cblx0ICogQHBhcmFtIGRpYWdvbmFsQmFzZUluZGV4IFRoZSBiYXNlIHJlZmVyZW5jZSBkaWFnb25hbC5cblx0ICogQHBhcmFtIG51bURpYWdvbmFscyBUaGUgdG90YWwgbnVtYmVyIG9mIGRpYWdvbmFscy5cblx0ICogQHJldHVybnMgVGhlIGNsaXBwZWQgZGlhZ29uYWwgaW5kZXguXG5cdCAqL1xuXHRwcml2YXRlIENsaXBEaWFnb25hbEJvdW5kKGRpYWdvbmFsOiBudW1iZXIsIG51bURpZmZlcmVuY2VzOiBudW1iZXIsIGRpYWdvbmFsQmFzZUluZGV4OiBudW1iZXIsIG51bURpYWdvbmFsczogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoZGlhZ29uYWwgPj0gMCAmJiBkaWFnb25hbCA8IG51bURpYWdvbmFscykge1xuXHRcdFx0Ly8gTm90aGluZyB0byBjbGlwLCBpdHMgaW4gcmFuZ2Vcblx0XHRcdHJldHVybiBkaWFnb25hbDtcblx0XHR9XG5cblx0XHQvLyBkaWFnb25hbHNCZWxvdzogVGhlIG51bWJlciBvZiBkaWFnb25hbHMgYmVsb3cgdGhlIHJlZmVyZW5jZSBkaWFnb25hbFxuXHRcdC8vIGRpYWdvbmFsc0Fib3ZlOiBUaGUgbnVtYmVyIG9mIGRpYWdvbmFscyBhYm92ZSB0aGUgcmVmZXJlbmNlIGRpYWdvbmFsXG5cdFx0Y29uc3QgZGlhZ29uYWxzQmVsb3cgPSBkaWFnb25hbEJhc2VJbmRleDtcblx0XHRjb25zdCBkaWFnb25hbHNBYm92ZSA9IG51bURpYWdvbmFscyAtIGRpYWdvbmFsQmFzZUluZGV4IC0gMTtcblx0XHRjb25zdCBkaWZmRXZlbiA9IChudW1EaWZmZXJlbmNlcyAlIDIgPT09IDApO1xuXG5cdFx0aWYgKGRpYWdvbmFsIDwgMCkge1xuXHRcdFx0Y29uc3QgbG93ZXJCb3VuZEV2ZW4gPSAoZGlhZ29uYWxzQmVsb3cgJSAyID09PSAwKTtcblx0XHRcdHJldHVybiAoZGlmZkV2ZW4gPT09IGxvd2VyQm91bmRFdmVuKSA/IDAgOiAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB1cHBlckJvdW5kRXZlbiA9IChkaWFnb25hbHNBYm92ZSAlIDIgPT09IDApO1xuXHRcdFx0cmV0dXJuIChkaWZmRXZlbiA9PT0gdXBwZXJCb3VuZEV2ZW4pID8gbnVtRGlhZ29uYWxzIC0gMSA6IG51bURpYWdvbmFscyAtIDI7XG5cdFx0fVxuXHR9XG59XG5cblxuLyoqXG4gKiBQcmVjb21wdXRlZCBlcXVhbGl0eSBhcnJheSBmb3IgY2hhcmFjdGVyIGNvZGVzLlxuICovXG5jb25zdCBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXkgPSBuZXcgVWludDMyQXJyYXkoMHgxMDAwMCk7XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIExldmVuc2h0ZWluIGRpc3RhbmNlIGZvciBzdHJpbmdzIG9mIGxlbmd0aCA8PSAzMi5cbiAqIEBwYXJhbSBmaXJzdFN0cmluZyAtIFRoZSBmaXJzdCBzdHJpbmcuXG4gKiBAcGFyYW0gc2Vjb25kU3RyaW5nIC0gVGhlIHNlY29uZCBzdHJpbmcuXG4gKiBAcmV0dXJucyBUaGUgTGV2ZW5zaHRlaW4gZGlzdGFuY2UuXG4gKi9cbmNvbnN0IGNvbXB1dGVMZXZlbnNodGVpbkRpc3RhbmNlRm9yU2hvcnRTdHJpbmdzID0gKGZpcnN0U3RyaW5nOiBzdHJpbmcsIHNlY29uZFN0cmluZzogc3RyaW5nKTogbnVtYmVyID0+IHtcblx0Y29uc3QgZmlyc3RTdHJpbmdMZW5ndGggPSBmaXJzdFN0cmluZy5sZW5ndGg7XG5cdGNvbnN0IHNlY29uZFN0cmluZ0xlbmd0aCA9IHNlY29uZFN0cmluZy5sZW5ndGg7XG5cdGNvbnN0IGxhc3RCaXRNYXNrID0gMSA8PCAoZmlyc3RTdHJpbmdMZW5ndGggLSAxKTtcblx0bGV0IHBvc2l0aXZlVmVjdG9yID0gLTE7XG5cdGxldCBuZWdhdGl2ZVZlY3RvciA9IDA7XG5cdGxldCBkaXN0YW5jZSA9IGZpcnN0U3RyaW5nTGVuZ3RoO1xuXHRsZXQgaW5kZXggPSBmaXJzdFN0cmluZ0xlbmd0aDtcblxuXHQvLyBJbml0aWFsaXplIHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheSBmb3IgZmlyc3RTdHJpbmdcblx0d2hpbGUgKGluZGV4LS0pIHtcblx0XHRwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlbZmlyc3RTdHJpbmcuY2hhckNvZGVBdChpbmRleCldIHw9IDEgPDwgaW5kZXg7XG5cdH1cblxuXHQvLyBQcm9jZXNzIGVhY2ggY2hhcmFjdGVyIG9mIHNlY29uZFN0cmluZ1xuXHRmb3IgKGluZGV4ID0gMDsgaW5kZXggPCBzZWNvbmRTdHJpbmdMZW5ndGg7IGluZGV4KyspIHtcblx0XHRsZXQgZXF1YWxpdHlNYXNrID0gcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5W3NlY29uZFN0cmluZy5jaGFyQ29kZUF0KGluZGV4KV07XG5cdFx0Y29uc3QgY29tYmluZWRWZWN0b3IgPSBlcXVhbGl0eU1hc2sgfCBuZWdhdGl2ZVZlY3Rvcjtcblx0XHRlcXVhbGl0eU1hc2sgfD0gKChlcXVhbGl0eU1hc2sgJiBwb3NpdGl2ZVZlY3RvcikgKyBwb3NpdGl2ZVZlY3RvcikgXiBwb3NpdGl2ZVZlY3Rvcjtcblx0XHRuZWdhdGl2ZVZlY3RvciB8PSB+KGVxdWFsaXR5TWFzayB8IHBvc2l0aXZlVmVjdG9yKTtcblx0XHRwb3NpdGl2ZVZlY3RvciAmPSBlcXVhbGl0eU1hc2s7XG5cdFx0aWYgKG5lZ2F0aXZlVmVjdG9yICYgbGFzdEJpdE1hc2spIHtcblx0XHRcdGRpc3RhbmNlKys7XG5cdFx0fVxuXHRcdGlmIChwb3NpdGl2ZVZlY3RvciAmIGxhc3RCaXRNYXNrKSB7XG5cdFx0XHRkaXN0YW5jZS0tO1xuXHRcdH1cblx0XHRuZWdhdGl2ZVZlY3RvciA9IChuZWdhdGl2ZVZlY3RvciA8PCAxKSB8IDE7XG5cdFx0cG9zaXRpdmVWZWN0b3IgPSAocG9zaXRpdmVWZWN0b3IgPDwgMSkgfCB+KGNvbWJpbmVkVmVjdG9yIHwgbmVnYXRpdmVWZWN0b3IpO1xuXHRcdG5lZ2F0aXZlVmVjdG9yICY9IGNvbWJpbmVkVmVjdG9yO1xuXHR9XG5cblx0Ly8gUmVzZXQgcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5XG5cdGluZGV4ID0gZmlyc3RTdHJpbmdMZW5ndGg7XG5cdHdoaWxlIChpbmRleC0tKSB7XG5cdFx0cHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5W2ZpcnN0U3RyaW5nLmNoYXJDb2RlQXQoaW5kZXgpXSA9IDA7XG5cdH1cblxuXHRyZXR1cm4gZGlzdGFuY2U7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBMZXZlbnNodGVpbiBkaXN0YW5jZSBmb3Igc3RyaW5ncyBvZiBsZW5ndGggPiAzMi5cbiAqIEBwYXJhbSBmaXJzdFN0cmluZyAtIFRoZSBmaXJzdCBzdHJpbmcuXG4gKiBAcGFyYW0gc2Vjb25kU3RyaW5nIC0gVGhlIHNlY29uZCBzdHJpbmcuXG4gKiBAcmV0dXJucyBUaGUgTGV2ZW5zaHRlaW4gZGlzdGFuY2UuXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVMZXZlbnNodGVpbkRpc3RhbmNlRm9yTG9uZ1N0cmluZ3MoZmlyc3RTdHJpbmc6IHN0cmluZywgc2Vjb25kU3RyaW5nOiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCBmaXJzdFN0cmluZ0xlbmd0aCA9IGZpcnN0U3RyaW5nLmxlbmd0aDtcblx0Y29uc3Qgc2Vjb25kU3RyaW5nTGVuZ3RoID0gc2Vjb25kU3RyaW5nLmxlbmd0aDtcblx0Y29uc3QgaG9yaXpvbnRhbEJpdEFycmF5ID0gW107XG5cdGNvbnN0IHZlcnRpY2FsQml0QXJyYXkgPSBbXTtcblx0Y29uc3QgaG9yaXpvbnRhbFNpemUgPSBNYXRoLmNlaWwoZmlyc3RTdHJpbmdMZW5ndGggLyAzMik7XG5cdGNvbnN0IHZlcnRpY2FsU2l6ZSA9IE1hdGguY2VpbChzZWNvbmRTdHJpbmdMZW5ndGggLyAzMik7XG5cblx0Ly8gSW5pdGlhbGl6ZSBob3Jpem9udGFsIGFuZCB2ZXJ0aWNhbCBiaXQgYXJyYXlzXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgaG9yaXpvbnRhbFNpemU7IGkrKykge1xuXHRcdGhvcml6b250YWxCaXRBcnJheVtpXSA9IC0xO1xuXHRcdHZlcnRpY2FsQml0QXJyYXlbaV0gPSAwO1xuXHR9XG5cblx0bGV0IHZlcnRpY2FsSW5kZXggPSAwO1xuXHRmb3IgKDsgdmVydGljYWxJbmRleCA8IHZlcnRpY2FsU2l6ZSAtIDE7IHZlcnRpY2FsSW5kZXgrKykge1xuXHRcdGxldCBuZWdhdGl2ZVZlY3RvciA9IDA7XG5cdFx0bGV0IHBvc2l0aXZlVmVjdG9yID0gLTE7XG5cdFx0Y29uc3Qgc3RhcnQgPSB2ZXJ0aWNhbEluZGV4ICogMzI7XG5cdFx0Y29uc3QgdmVydGljYWxMZW5ndGggPSBNYXRoLm1pbigzMiwgc2Vjb25kU3RyaW5nTGVuZ3RoKSArIHN0YXJ0O1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXkgZm9yIHNlY29uZFN0cmluZ1xuXHRcdGZvciAobGV0IGsgPSBzdGFydDsgayA8IHZlcnRpY2FsTGVuZ3RoOyBrKyspIHtcblx0XHRcdHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtzZWNvbmRTdHJpbmcuY2hhckNvZGVBdChrKV0gfD0gMSA8PCBrO1xuXHRcdH1cblxuXHRcdC8vIFByb2Nlc3MgZWFjaCBjaGFyYWN0ZXIgb2YgZmlyc3RTdHJpbmdcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZpcnN0U3RyaW5nTGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVxdWFsaXR5TWFzayA9IHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtmaXJzdFN0cmluZy5jaGFyQ29kZUF0KGkpXTtcblx0XHRcdGNvbnN0IHByZXZpb3VzQml0ID0gKGhvcml6b250YWxCaXRBcnJheVsoaSAvIDMyKSB8IDBdID4+PiBpKSAmIDE7XG5cdFx0XHRjb25zdCBtYXRjaEJpdCA9ICh2ZXJ0aWNhbEJpdEFycmF5WyhpIC8gMzIpIHwgMF0gPj4+IGkpICYgMTtcblx0XHRcdGNvbnN0IGNvbWJpbmVkVmVjdG9yID0gZXF1YWxpdHlNYXNrIHwgbmVnYXRpdmVWZWN0b3I7XG5cdFx0XHRjb25zdCBjb21iaW5lZEhvcml6b250YWxWZWN0b3IgPSAoKCgoZXF1YWxpdHlNYXNrIHwgbWF0Y2hCaXQpICYgcG9zaXRpdmVWZWN0b3IpICsgcG9zaXRpdmVWZWN0b3IpIF4gcG9zaXRpdmVWZWN0b3IpIHwgZXF1YWxpdHlNYXNrIHwgbWF0Y2hCaXQ7XG5cdFx0XHRsZXQgcG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yID0gbmVnYXRpdmVWZWN0b3IgfCB+KGNvbWJpbmVkSG9yaXpvbnRhbFZlY3RvciB8IHBvc2l0aXZlVmVjdG9yKTtcblx0XHRcdGxldCBuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPSBwb3NpdGl2ZVZlY3RvciAmIGNvbWJpbmVkSG9yaXpvbnRhbFZlY3Rvcjtcblx0XHRcdGlmICgocG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yID4+PiAzMSkgXiBwcmV2aW91c0JpdCkge1xuXHRcdFx0XHRob3Jpem9udGFsQml0QXJyYXlbKGkgLyAzMikgfCAwXSBePSAxIDw8IGk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciA+Pj4gMzEpIF4gbWF0Y2hCaXQpIHtcblx0XHRcdFx0dmVydGljYWxCaXRBcnJheVsoaSAvIDMyKSB8IDBdIF49IDEgPDwgaTtcblx0XHRcdH1cblx0XHRcdHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA9IChwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IgPDwgMSkgfCBwcmV2aW91c0JpdDtcblx0XHRcdG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciA9IChuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPDwgMSkgfCBtYXRjaEJpdDtcblx0XHRcdHBvc2l0aXZlVmVjdG9yID0gbmVnYXRpdmVIb3Jpem9udGFsVmVjdG9yIHwgfihjb21iaW5lZFZlY3RvciB8IHBvc2l0aXZlSG9yaXpvbnRhbFZlY3Rvcik7XG5cdFx0XHRuZWdhdGl2ZVZlY3RvciA9IHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciAmIGNvbWJpbmVkVmVjdG9yO1xuXHRcdH1cblxuXHRcdC8vIFJlc2V0IHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVxuXHRcdGZvciAobGV0IGsgPSBzdGFydDsgayA8IHZlcnRpY2FsTGVuZ3RoOyBrKyspIHtcblx0XHRcdHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtzZWNvbmRTdHJpbmcuY2hhckNvZGVBdChrKV0gPSAwO1xuXHRcdH1cblx0fVxuXG5cdGxldCBuZWdhdGl2ZVZlY3RvciA9IDA7XG5cdGxldCBwb3NpdGl2ZVZlY3RvciA9IC0xO1xuXHRjb25zdCBzdGFydCA9IHZlcnRpY2FsSW5kZXggKiAzMjtcblx0Y29uc3QgdmVydGljYWxMZW5ndGggPSBNYXRoLm1pbigzMiwgc2Vjb25kU3RyaW5nTGVuZ3RoIC0gc3RhcnQpICsgc3RhcnQ7XG5cblx0Ly8gSW5pdGlhbGl6ZSBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXkgZm9yIHNlY29uZFN0cmluZ1xuXHRmb3IgKGxldCBrID0gc3RhcnQ7IGsgPCB2ZXJ0aWNhbExlbmd0aDsgaysrKSB7XG5cdFx0cHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5W3NlY29uZFN0cmluZy5jaGFyQ29kZUF0KGspXSB8PSAxIDw8IGs7XG5cdH1cblxuXHRsZXQgZGlzdGFuY2UgPSBzZWNvbmRTdHJpbmdMZW5ndGg7XG5cblx0Ly8gUHJvY2VzcyBlYWNoIGNoYXJhY3RlciBvZiBmaXJzdFN0cmluZ1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGZpcnN0U3RyaW5nTGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBlcXVhbGl0eU1hc2sgPSBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlbZmlyc3RTdHJpbmcuY2hhckNvZGVBdChpKV07XG5cdFx0Y29uc3QgcHJldmlvdXNCaXQgPSAoaG9yaXpvbnRhbEJpdEFycmF5WyhpIC8gMzIpIHwgMF0gPj4+IGkpICYgMTtcblx0XHRjb25zdCBtYXRjaEJpdCA9ICh2ZXJ0aWNhbEJpdEFycmF5WyhpIC8gMzIpIHwgMF0gPj4+IGkpICYgMTtcblx0XHRjb25zdCBjb21iaW5lZFZlY3RvciA9IGVxdWFsaXR5TWFzayB8IG5lZ2F0aXZlVmVjdG9yO1xuXHRcdGNvbnN0IGNvbWJpbmVkSG9yaXpvbnRhbFZlY3RvciA9ICgoKChlcXVhbGl0eU1hc2sgfCBtYXRjaEJpdCkgJiBwb3NpdGl2ZVZlY3RvcikgKyBwb3NpdGl2ZVZlY3RvcikgXiBwb3NpdGl2ZVZlY3RvcikgfCBlcXVhbGl0eU1hc2sgfCBtYXRjaEJpdDtcblx0XHRsZXQgcG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yID0gbmVnYXRpdmVWZWN0b3IgfCB+KGNvbWJpbmVkSG9yaXpvbnRhbFZlY3RvciB8IHBvc2l0aXZlVmVjdG9yKTtcblx0XHRsZXQgbmVnYXRpdmVIb3Jpem9udGFsVmVjdG9yID0gcG9zaXRpdmVWZWN0b3IgJiBjb21iaW5lZEhvcml6b250YWxWZWN0b3I7XG5cdFx0ZGlzdGFuY2UgKz0gKHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA+Pj4gKHNlY29uZFN0cmluZ0xlbmd0aCAtIDEpKSAmIDE7XG5cdFx0ZGlzdGFuY2UgLT0gKG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciA+Pj4gKHNlY29uZFN0cmluZ0xlbmd0aCAtIDEpKSAmIDE7XG5cdFx0aWYgKChwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IgPj4+IDMxKSBeIHByZXZpb3VzQml0KSB7XG5cdFx0XHRob3Jpem9udGFsQml0QXJyYXlbKGkgLyAzMikgfCAwXSBePSAxIDw8IGk7XG5cdFx0fVxuXHRcdGlmICgobmVnYXRpdmVIb3Jpem9udGFsVmVjdG9yID4+PiAzMSkgXiBtYXRjaEJpdCkge1xuXHRcdFx0dmVydGljYWxCaXRBcnJheVsoaSAvIDMyKSB8IDBdIF49IDEgPDwgaTtcblx0XHR9XG5cdFx0cG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yID0gKHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA8PCAxKSB8IHByZXZpb3VzQml0O1xuXHRcdG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciA9IChuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPDwgMSkgfCBtYXRjaEJpdDtcblx0XHRwb3NpdGl2ZVZlY3RvciA9IG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciB8IH4oY29tYmluZWRWZWN0b3IgfCBwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IpO1xuXHRcdG5lZ2F0aXZlVmVjdG9yID0gcG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yICYgY29tYmluZWRWZWN0b3I7XG5cdH1cblxuXHQvLyBSZXNldCBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlcblx0Zm9yIChsZXQgayA9IHN0YXJ0OyBrIDwgdmVydGljYWxMZW5ndGg7IGsrKykge1xuXHRcdHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtzZWNvbmRTdHJpbmcuY2hhckNvZGVBdChrKV0gPSAwO1xuXHR9XG5cblx0cmV0dXJuIGRpc3RhbmNlO1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBMZXZlbnNodGVpbiBkaXN0YW5jZSBiZXR3ZWVuIHR3byBzdHJpbmdzLlxuICogQHBhcmFtIGZpcnN0U3RyaW5nIC0gVGhlIGZpcnN0IHN0cmluZy5cbiAqIEBwYXJhbSBzZWNvbmRTdHJpbmcgLSBUaGUgc2Vjb25kIHN0cmluZy5cbiAqIEByZXR1cm5zIFRoZSBMZXZlbnNodGVpbiBkaXN0YW5jZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVMZXZlbnNodGVpbkRpc3RhbmNlKGZpcnN0U3RyaW5nOiBzdHJpbmcsIHNlY29uZFN0cmluZzogc3RyaW5nKTogbnVtYmVyIHtcblx0aWYgKGZpcnN0U3RyaW5nLmxlbmd0aCA8IHNlY29uZFN0cmluZy5sZW5ndGgpIHtcblx0XHRjb25zdCB0ZW1wID0gc2Vjb25kU3RyaW5nO1xuXHRcdHNlY29uZFN0cmluZyA9IGZpcnN0U3RyaW5nO1xuXHRcdGZpcnN0U3RyaW5nID0gdGVtcDtcblx0fVxuXHRpZiAoc2Vjb25kU3RyaW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmaXJzdFN0cmluZy5sZW5ndGg7XG5cdH1cblx0aWYgKGZpcnN0U3RyaW5nLmxlbmd0aCA8PSAzMikge1xuXHRcdHJldHVybiBjb21wdXRlTGV2ZW5zaHRlaW5EaXN0YW5jZUZvclNob3J0U3RyaW5ncyhmaXJzdFN0cmluZywgc2Vjb25kU3RyaW5nKTtcblx0fVxuXHRyZXR1cm4gY29tcHV0ZUxldmVuc2h0ZWluRGlzdGFuY2VGb3JMb25nU3RyaW5ncyhmaXJzdFN0cmluZywgc2Vjb25kU3RyaW5nKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBRW5CLE1BQU0sbUJBQXdDO0FBQUEsRUFFcEQsWUFBb0IsUUFBZ0I7QUFBaEI7QUFBQSxFQUFrQjtBQUFBLEVBRXRDLGNBQWdEO0FBQy9DLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQU0sYUFBYSxJQUFJLFdBQVcsT0FBTyxNQUFNO0FBQy9DLGFBQVMsSUFBSSxHQUFHLE1BQU0sT0FBTyxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ2xELGlCQUFXLENBQUMsSUFBSSxPQUFPLFdBQVcsQ0FBQztBQUFBLElBQ3BDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVPLFNBQVMsV0FBVyxVQUFrQixVQUFrQixRQUFnQztBQUM5RixTQUFPLElBQUksUUFBUSxJQUFJLG1CQUFtQixRQUFRLEdBQUcsSUFBSSxtQkFBbUIsUUFBUSxDQUFDLEVBQUUsWUFBWSxNQUFNLEVBQUU7QUFDNUc7QUE4Q0EsTUFBTSxNQUFNO0FBQUEs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eEQ7QUFBQSxFQUNEO0FBRUEsTUFBSSxpQkFBaUI7QUFDckIsTUFBSSxpQkFBaUI7QUFDckIsUUFBTSxRQUFRLGdCQUFnQjtBQUM5QixRQUFNLGlCQUFpQixLQUFLLElBQUksSUFBSSxxQkFBcUIsS0FBSyxJQUFJO0FBR2xFLFdBQVMsSUFBSSxPQUFPLElBQUksZ0JBQWdCLEtBQUs7QUFDNUMsNkJBQXlCLGFBQWEsV0FBVyxDQUFDLENBQUMsS0FBSyxLQUFLO0FBQUEsRUFDOUQ7QUFFQSxNQUFJLFdBQVc7QUFHZixXQUFTLElBQUksR0FBRyxJQUFJLG1CQUFtQixLQUFLO0FBQzNDLFVBQU0sZUFBZSx5QkFBeUIsWUFBWSxXQUFXLENBQUMsQ0FBQztBQUN2RSxVQUFNLGNBQWUsbUJBQW9CLElBQUksS0FBTSxDQUFDLE1BQU0sSUFBSztBQUMvRCxVQUFNLFdBQVksaUJBQWtCLElBQUksS0FBTSxDQUFDLE1BQU0sSUFBSztBQUMxRCxVQUFNLGlCQUFpQixlQUFlO0FBQ3RDLFVBQU0sNkJBQStCLGVBQWUsWUFBWSxrQkFBa0IsaUJBQWtCLGlCQUFrQixlQUFlO0FBQ3JJLFFBQUksMkJBQTJCLGlCQUFpQixFQUFFLDJCQUEyQjtBQUM3RSxRQUFJLDJCQUEyQixpQkFBaUI7QUFDaEQsZ0JBQWEsNkJBQThCLHFCQUFxQixJQUFNO0FBQ3RFLGdCQUFhLDZCQUE4QixxQkFBcUIsSUFBTTtBQUN0RSxRQUFLLDZCQUE2QixLQUFNLGFBQWE7QUFDcEQseUJBQW9CLElBQUksS0FBTSxDQUFDLEtBQUssS0FBSztBQUFBLElBQzFDO0FBQ0EsUUFBSyw2QkFBNkIsS0FBTSxVQUFVO0FBQ2pELHVCQUFrQixJQUFJLEtBQU0sQ0FBQyxLQUFLLEtBQUs7QUFBQSxJQUN4QztBQUNBLCtCQUE0Qiw0QkFBNEIsSUFBSztBQUM3RCwrQkFBNEIsNEJBQTRCLElBQUs7QUFDN0QscUJBQWlCLDJCQUEyQixFQUFFLGlCQUFpQjtBQUMvRCxxQkFBaUIsMkJBQTJCO0FBQUEsRUFDN0M7QUFHQSxXQUFTLElBQUksT0FBTyxJQUFJLGdCQUFnQixLQUFLO0FBQzVDLDZCQUF5QixhQUFhLFdBQVcsQ0FBQyxDQUFDLElBQUk7QUFBQSxFQUN4RDtBQUVBLFNBQU87QUFDUjtBQVFPLFNBQVMsMkJBQTJCLGFBQXFCLGNBQThCO0FBQzdGLE1BQUksWUFBWSxTQUFTLGFBQWEsUUFBUTtBQUM3QyxVQUFNLE9BQU87QUFDYixtQkFBZTtBQUNmLGtCQUFjO0FBQUEsRUFDZjtBQUNBLE1BQUksYUFBYSxXQUFXLEdBQUc7QUFDOUIsV0FBTyxZQUFZO0FBQUEsRUFDcEI7QUFDQSxNQUFJLFlBQVksVUFBVSxJQUFJO0FBQzdCLFdBQU8sMENBQTBDLGFBQWEsWUFBWTtBQUFBLEVBQzNFO0FBQ0EsU0FBTyx5Q0FBeUMsYUFBYSxZQUFZO0FBQzFFOyIsCiAgIm5hbWVzIjogWyJMb2NhbENvbnN0YW50cyIsICJuZWdhdGl2ZVZlY3RvciIsICJwb3NpdGl2ZVZlY3RvciIsICJzdGFydCIsICJ2ZXJ0aWNhbExlbmd0aCJdCn0K
