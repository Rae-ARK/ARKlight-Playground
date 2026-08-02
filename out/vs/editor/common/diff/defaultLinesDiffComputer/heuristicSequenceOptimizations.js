import { forEachWithNeighbors } from "../../../../base/common/arrays.js";
import { OffsetRange } from "../../core/ranges/offsetRange.js";
import { OffsetPair, SequenceDiff } from "./algorithms/diffAlgorithm.js";
function optimizeSequenceDiffs(sequence1, sequence2, sequenceDiffs) {
  let result = sequenceDiffs;
  result = joinSequenceDiffsByShifting(sequence1, sequence2, result);
  result = joinSequenceDiffsByShifting(sequence1, sequence2, result);
  result = shiftSequenceDiffs(sequence1, sequence2, result);
  return result;
}
function joinSequenceDiffsByShifting(sequence1, sequence2, sequenceDiffs) {
  if (sequenceDiffs.length === 0) {
    return sequenceDiffs;
  }
  const result = [];
  result.push(sequenceDiffs[0]);
  for (let i = 1; i < sequenceDiffs.length; i++) {
    const prevResult = result[result.length - 1];
    let cur = sequenceDiffs[i];
    if (cur.seq1Range.isEmpty || cur.seq2Range.isEmpty) {
      const length = cur.seq1Range.start - prevResult.seq1Range.endExclusive;
      let d;
      for (d = 1; d <= length; d++) {
        if (sequence1.getElement(cur.seq1Range.start - d) !== sequence1.getElement(cur.seq1Range.endExclusive - d) || sequence2.getElement(cur.seq2Range.start - d) !== sequence2.getElement(cur.seq2Range.endExclusive - d)) {
          break;
        }
      }
      d--;
      if (d === length) {
        result[result.length - 1] = new SequenceDiff(
          new OffsetRange(prevResult.seq1Range.start, cur.seq1Range.endExclusive - length),
          new OffsetRange(prevResult.seq2Range.start, cur.seq2Range.endExclusive - length)
        );
        continue;
      }
      cur = cur.delta(-d);
    }
    result.push(cur);
  }
  const result2 = [];
  for (let i = 0; i < result.length - 1; i++) {
    const nextResult = result[i + 1];
    let cur = result[i];
    if (cur.seq1Range.isEmpty || cur.seq2Range.isEmpty) {
      const length = nextResult.seq1Range.start - cur.seq1Range.endExclusive;
      let d;
      for (d = 0; d < length; d++) {
        if (!sequence1.isStronglyEqual(cur.seq1Range.start + d, cur.seq1Range.endExclusive + d) || !sequence2.isStronglyEqual(cur.seq2Range.start + d, cur.seq2Range.endExclusive + d)) {
          break;
        }
      }
      if (d === length) {
        result[i + 1] = new SequenceDiff(
          new OffsetRange(cur.seq1Range.start + length, nextResult.seq1Range.endExclusive),
          new OffsetRange(cur.seq2Range.start + length, nextResult.seq2Range.endExclusive)
        );
        continue;
      }
      if (d > 0) {
        cur = cur.delta(d);
      }
    }
    result2.push(cur);
  }
  if (result.length > 0) {
    result2.push(result[result.length - 1]);
  }
  return result2;
}
function shiftSequenceDiffs(sequence1, sequence2, sequenceDiffs) {
  if (!sequence1.getBoundaryScore || !sequence2.getBoundaryScore) {
    return sequenceDiffs;
  }
  for (let i = 0; i < sequenceDiffs.length; i++) {
    const prevDiff = i > 0 ? sequenceDiffs[i - 1] : void 0;
    const diff = sequenceDiffs[i];
    const nextDiff = i + 1 < sequenceDiffs.length ? sequenceDiffs[i + 1] : void 0;
    const seq1ValidRange = new OffsetRange(prevDiff ? prevDiff.seq1Range.endExclusive + 1 : 0, nextDiff ? nextDiff.seq1Range.start - 1 : sequence1.length);
    const seq2ValidRange = new OffsetRange(prevDiff ? prevDiff.seq2Range.endExclusive + 1 : 0, nextDiff ? nextDiff.seq2Range.start - 1 : sequence2.length);
    if (diff.seq1Range.isEmpty) {
      sequenceDiffs[i] = shiftDiffToBetterPosition(diff, sequence1, sequence2, seq1ValidRange, seq2ValidRange);
    } else if (diff.seq2Range.isEmpty) {
      sequenceDiffs[i] = shiftDiffToBetterPosition(diff.swap(), sequence2, sequence1, seq2ValidRange, seq1ValidRange).swap();
    }
  }
  return sequenceDiffs;
}
function shiftDiffToBetterPosition(diff, sequence1, sequence2, seq1ValidRange, seq2ValidRange) {
  const maxShiftLimit = 100;
  let deltaBefore = 1;
  while (diff.seq1Range.start - deltaBefore >= seq1ValidRange.start && diff.seq2Range.start - deltaBefore >= seq2ValidRange.start && sequence2.isStronglyEqual(diff.seq2Range.start - deltaBefore, diff.seq2Range.endExclusive - deltaBefore) && deltaBefore < maxShiftLimit) {
    deltaBefore++;
  }
  deltaBefore--;
  let deltaAfter = 0;
  while (diff.seq1Range.start + deltaAfter < seq1ValidRange.endExclusive && diff.seq2Range.endExclusive + deltaAfter < seq2ValidRange.endExclusive && sequence2.isStronglyEqual(diff.seq2Range.start + deltaAfter, diff.seq2Range.endExclusive + deltaAfter) && deltaAfter < maxShiftLimit) {
    deltaAfter++;
  }
  if (deltaBefore === 0 && deltaAfter === 0) {
    return diff;
  }
  let bestDelta = 0;
  let bestScore = -1;
  for (let delta = -deltaBefore; delta <= deltaAfter; delta++) {
    const seq2OffsetStart = diff.seq2Range.start + delta;
    const seq2OffsetEndExclusive = diff.seq2Range.endExclusive + delta;
    const seq1Offset = diff.seq1Range.start + delta;
    const score = sequence1.getBoundaryScore(seq1Offset) + sequence2.getBoundaryScore(seq2OffsetStart) + sequence2.getBoundaryScore(seq2OffsetEndExclusive);
    if (score > bestScore) {
      bestScore = score;
      bestDelta = delta;
    }
  }
  return diff.delta(bestDelta);
}
function removeShortMatches(sequence1, sequence2, sequenceDiffs) {
  const result = [];
  for (const s of sequenceDiffs) {
    const last = result[result.length - 1];
    if (!last) {
      result.push(s);
      continue;
    }
    if (s.seq1Range.start - last.seq1Range.endExclusive <= 2 || s.seq2Range.start - last.seq2Range.endExclusive <= 2) {
      result[result.length - 1] = new SequenceDiff(last.seq1Range.join(s.seq1Range), last.seq2Range.join(s.seq2Range));
    } else {
      result.push(s);
    }
  }
  return result;
}
function extendDiffsToEntireWordIfAppropriate(sequence1, sequence2, sequenceDiffs, findParent, force = false) {
  const equalMappings = SequenceDiff.invert(sequenceDiffs, sequence1.length);
  const additional = [];
  let lastPoint = new OffsetPair(0, 0);
  function scanWord(pair, equalMapping) {
    if (pair.offset1 < lastPoint.offset1 || pair.offset2 < lastPoint.offset2) {
      return;
    }
    const w1 = findParent(sequence1, pair.offset1);
    const w2 = findParent(sequence2, pair.offset2);
    if (!w1 || !w2) {
      return;
    }
    let w = new SequenceDiff(w1, w2);
    const equalPart = w.intersect(equalMapping);
    let equalChars1 = equalPart.seq1Range.length;
    let equalChars2 = equalPart.seq2Range.length;
    while (equalMappings.length > 0) {
      const next = equalMappings[0];
      const intersects = next.seq1Range.intersects(w.seq1Range) || next.seq2Range.intersects(w.seq2Range);
      if (!intersects) {
        break;
      }
      const v1 = findParent(sequence1, next.seq1Range.start);
      const v2 = findParent(sequence2, next.seq2Range.start);
      const v = new SequenceDiff(v1, v2);
      const equalPart2 = v.intersect(next);
      equalChars1 += equalPart2.seq1Range.length;
      equalChars2 += equalPart2.seq2Range.length;
      w = w.join(v);
      if (w.seq1Range.endExclusive >= next.seq1Range.endExclusive) {
        equalMappings.shift();
      } else {
        break;
      }
    }
    if (force && equalChars1 + equalChars2 < w.seq1Range.length + w.seq2Range.length || equalChars1 + equalChars2 < (w.seq1Range.length + w.seq2Range.length) * 2 / 3) {
      additional.push(w);
    }
    lastPoint = w.getEndExclusives();
  }
  while (equalMappings.length > 0) {
    const next = equalMappings.shift();
    if (next.seq1Range.isEmpty) {
      continue;
    }
    scanWord(next.getStarts(), next);
    scanWord(next.getEndExclusives().delta(-1), next);
  }
  const merged = mergeSequenceDiffs(sequenceDiffs, additional);
  return merged;
}
function mergeSequenceDiffs(sequenceDiffs1, sequenceDiffs2) {
  const result = [];
  while (sequenceDiffs1.length > 0 || sequenceDiffs2.length > 0) {
    const sd1 = sequenceDiffs1[0];
    const sd2 = sequenceDiffs2[0];
    let next;
    if (sd1 && (!sd2 || sd1.seq1Range.start < sd2.seq1Range.start)) {
      next = sequenceDiffs1.shift();
    } else {
      next = sequenceDiffs2.shift();
    }
    if (result.length > 0 && result[result.length - 1].seq1Range.endExclusive >= next.seq1Range.start) {
      result[result.length - 1] = result[result.length - 1].join(next);
    } else {
      result.push(next);
    }
  }
  return result;
}
function removeVeryShortMatchingLinesBetweenDiffs(sequence1, _sequence2, sequenceDiffs) {
  let diffs = sequenceDiffs;
  if (diffs.length === 0) {
    return diffs;
  }
  let counter = 0;
  let shouldRepeat;
  do {
    shouldRepeat = false;
    const result = [
      diffs[0]
    ];
    for (let i = 1; i < diffs.length; i++) {
      let shouldJoinDiffs2 = function(before, after) {
        const unchangedRange = new OffsetRange(lastResult.seq1Range.endExclusive, cur.seq1Range.start);
        const unchangedText = sequence1.getText(unchangedRange);
        const unchangedTextWithoutWs = unchangedText.replace(/\s/g, "");
        if (unchangedTextWithoutWs.length <= 4 && (before.seq1Range.length + before.seq2Range.length > 5 || after.seq1Range.length + after.seq2Range.length > 5)) {
          return true;
        }
        return false;
      };
      var shouldJoinDiffs = shouldJoinDiffs2;
      const cur = diffs[i];
      const lastResult = result[result.length - 1];
      const shouldJoin = shouldJoinDiffs2(lastResult, cur);
      if (shouldJoin) {
        shouldRepeat = true;
        result[result.length - 1] = result[result.length - 1].join(cur);
      } else {
        result.push(cur);
      }
    }
    diffs = result;
  } while (counter++ < 10 && shouldRepeat);
  return diffs;
}
function removeVeryShortMatchingTextBetweenLongDiffs(sequence1, sequence2, sequenceDiffs) {
  let diffs = sequenceDiffs;
  if (diffs.length === 0) {
    return diffs;
  }
  let counter = 0;
  let shouldRepeat;
  do {
    shouldRepeat = false;
    const result = [
      diffs[0]
    ];
    for (let i = 1; i < diffs.length; i++) {
      let shouldJoinDiffs2 = function(before, after) {
        const unchangedRange = new OffsetRange(lastResult.seq1Range.endExclusive, cur.seq1Range.start);
        const unchangedLineCount = sequence1.countLinesIn(unchangedRange);
        if (unchangedLineCount > 5 || unchangedRange.length > 500) {
          return false;
        }
        const unchangedText = sequence1.getText(unchangedRange).trim();
        if (unchangedText.length > 20 || unchangedText.split(/\r\n|\r|\n/).length > 1) {
          return false;
        }
        const beforeLineCount1 = sequence1.countLinesIn(before.seq1Range);
        const beforeSeq1Length = before.seq1Range.length;
        const beforeLineCount2 = sequence2.countLinesIn(before.seq2Range);
        const beforeSeq2Length = before.seq2Range.length;
        const afterLineCount1 = sequence1.countLinesIn(after.seq1Range);
        const afterSeq1Length = after.seq1Range.length;
        const afterLineCount2 = sequence2.countLinesIn(after.seq2Range);
        const afterSeq2Length = after.seq2Range.length;
        const max = 2 * 40 + 50;
        function cap(v) {
          return Math.min(v, max);
        }
        if (Math.pow(Math.pow(cap(beforeLineCount1 * 40 + beforeSeq1Length), 1.5) + Math.pow(cap(beforeLineCount2 * 40 + beforeSeq2Length), 1.5), 1.5) + Math.pow(Math.pow(cap(afterLineCount1 * 40 + afterSeq1Length), 1.5) + Math.pow(cap(afterLineCount2 * 40 + afterSeq2Length), 1.5), 1.5) > (max ** 1.5) ** 1.5 * 1.3) {
          return true;
        }
        return false;
      };
      var shouldJoinDiffs = shouldJoinDiffs2;
      const cur = diffs[i];
      const lastResult = result[result.length - 1];
      const shouldJoin = shouldJoinDiffs2(lastResult, cur);
      if (shouldJoin) {
        shouldRepeat = true;
        result[result.length - 1] = result[result.length - 1].join(cur);
      } else {
        result.push(cur);
      }
    }
    diffs = result;
  } while (counter++ < 10 && shouldRepeat);
  const newDiffs = [];
  forEachWithNeighbors(diffs, (prev, cur, next) => {
    let newDiff = cur;
    function shouldMarkAsChanged(text) {
      return text.length > 0 && text.trim().length <= 3 && cur.seq1Range.length + cur.seq2Range.length > 100;
    }
    const fullRange1 = sequence1.extendToFullLines(cur.seq1Range);
    const prefix = sequence1.getText(new OffsetRange(fullRange1.start, cur.seq1Range.start));
    if (shouldMarkAsChanged(prefix)) {
      newDiff = newDiff.deltaStart(-prefix.length);
    }
    const suffix = sequence1.getText(new OffsetRange(cur.seq1Range.endExclusive, fullRange1.endExclusive));
    if (shouldMarkAsChanged(suffix)) {
      newDiff = newDiff.deltaEnd(suffix.length);
    }
    const availableSpace = SequenceDiff.fromOffsetPairs(
      prev ? prev.getEndExclusives() : OffsetPair.zero,
      next ? next.getStarts() : OffsetPair.max
    );
    const result = newDiff.intersect(availableSpace);
    if (newDiffs.length > 0 && result.getStarts().equals(newDiffs[newDiffs.length - 1].getEndExclusives())) {
      newDiffs[newDiffs.length - 1] = newDiffs[newDiffs.length - 1].join(result);
    } else {
      newDiffs.push(result);
    }
  });
  return newDiffs;
}
export {
  extendDiffsToEntireWordIfAppropriate,
  optimizeSequenceDiffs,
  removeShortMatches,
  removeVeryShortMatchingLinesBetweenDiffs,
  removeVeryShortMatchingTextBetweenLongDiffs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvaGV1cmlzdGljU2VxdWVuY2VPcHRpbWl6YXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZm9yRWFjaFdpdGhOZWlnaGJvcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VxdWVuY2UsIE9mZnNldFBhaXIsIFNlcXVlbmNlRGlmZiB9IGZyb20gJy4vYWxnb3JpdGhtcy9kaWZmQWxnb3JpdGhtLmpzJztcbmltcG9ydCB7IExpbmVTZXF1ZW5jZSB9IGZyb20gJy4vbGluZVNlcXVlbmNlLmpzJztcbmltcG9ydCB7IExpbmVzU2xpY2VDaGFyU2VxdWVuY2UgfSBmcm9tICcuL2xpbmVzU2xpY2VDaGFyU2VxdWVuY2UuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gb3B0aW1pemVTZXF1ZW5jZURpZmZzKHNlcXVlbmNlMTogSVNlcXVlbmNlLCBzZXF1ZW5jZTI6IElTZXF1ZW5jZSwgc2VxdWVuY2VEaWZmczogU2VxdWVuY2VEaWZmW10pOiBTZXF1ZW5jZURpZmZbXSB7XG5cdGxldCByZXN1bHQgPSBzZXF1ZW5jZURpZmZzO1xuXHRyZXN1bHQgPSBqb2luU2VxdWVuY2VEaWZmc0J5U2hpZnRpbmcoc2VxdWVuY2UxLCBzZXF1ZW5jZTIsIHJlc3VsdCk7XG5cdC8vIFNvbWV0aW1lcywgY2FsbGluZyB0aGlzIGZ1bmN0aW9uIHR3aWNlIGltcHJvdmVzIHRoZSByZXN1bHQuXG5cdC8vIFVuY29tbWVudCB0aGUgc2Vjb25kIGludm9jYXRpb24gYW5kIHJ1biB0aGUgdGVzdHMgdG8gc2VlIHRoZSBkaWZmZXJlbmNlLlxuXHRyZXN1bHQgPSBqb2luU2VxdWVuY2VEaWZmc0J5U2hpZnRpbmcoc2VxdWVuY2UxLCBzZXF1ZW5jZTIsIHJlc3VsdCk7XG5cdHJlc3VsdCA9IHNoaWZ0U2VxdWVuY2VEaWZmcyhzZXF1ZW5jZTEsIHNlcXVlbmNlMiwgcmVzdWx0KTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGZpeGVzIGlzc3VlcyBsaWtlIHRoaXM6XG4gKiBgYGBcbiAqIGltcG9ydCB7IEJheiwgQmFyIH0gZnJvbSBcImZvb1wiO1xuICogYGBgXG4gKiA8LT5cbiAqIGBgYFxuICogaW1wb3J0IHsgQmF6LCBCYXIsIEZvbyB9IGZyb20gXCJmb29cIjtcbiAqIGBgYFxuICogQ29tcHV0ZWQgZGlmZjogWyB7QWRkIFwiLFwiIGFmdGVyIEJhcn0sIHtBZGQgXCJGb28gXCIgYWZ0ZXIgc3BhY2V9IH1cbiAqIEltcHJvdmVkIGRpZmY6IFt7QWRkIFwiLCBGb29cIiBhZnRlciBCYXJ9XVxuICovXG5mdW5jdGlvbiBqb2luU2VxdWVuY2VEaWZmc0J5U2hpZnRpbmcoc2VxdWVuY2UxOiBJU2VxdWVuY2UsIHNlcXVlbmNlMjogSVNlcXVlbmNlLCBzZXF1ZW5jZURpZmZzOiBTZXF1ZW5jZURpZmZbXSk6IFNlcXVlbmNlRGlmZltdIHtcblx0aWYgKHNlcXVlbmNlRGlmZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHNlcXVlbmNlRGlmZnM7XG5cdH1cblxuXHRjb25zdCByZXN1bHQ6IFNlcXVlbmNlRGlmZltdID0gW107XG5cdHJlc3VsdC5wdXNoKHNlcXVlbmNlRGlmZnNbMF0pO1xuXG5cdC8vIEZpcnN0IG1vdmUgdGhlbSBhbGwgdG8gdGhlIGxlZnQgYXMgbXVjaCBhcyBwb3NzaWJsZSBhbmQgam9pbiB0aGVtIGlmIHBvc3NpYmxlXG5cdGZvciAobGV0IGkgPSAxOyBpIDwgc2VxdWVuY2VEaWZmcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHByZXZSZXN1bHQgPSByZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdO1xuXHRcdGxldCBjdXIgPSBzZXF1ZW5jZURpZmZzW2ldO1xuXG5cdFx0aWYgKGN1ci5zZXExUmFuZ2UuaXNFbXB0eSB8fCBjdXIuc2VxMlJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IGN1ci5zZXExUmFuZ2Uuc3RhcnQgLSBwcmV2UmVzdWx0LnNlcTFSYW5nZS5lbmRFeGNsdXNpdmU7XG5cdFx0XHRsZXQgZDtcblx0XHRcdGZvciAoZCA9IDE7IGQgPD0gbGVuZ3RoOyBkKyspIHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHNlcXVlbmNlMS5nZXRFbGVtZW50KGN1ci5zZXExUmFuZ2Uuc3RhcnQgLSBkKSAhPT0gc2VxdWVuY2UxLmdldEVsZW1lbnQoY3VyLnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUgLSBkKSB8fFxuXHRcdFx0XHRcdHNlcXVlbmNlMi5nZXRFbGVtZW50KGN1ci5zZXEyUmFuZ2Uuc3RhcnQgLSBkKSAhPT0gc2VxdWVuY2UyLmdldEVsZW1lbnQoY3VyLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgLSBkKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRkLS07XG5cblx0XHRcdGlmIChkID09PSBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gTWVyZ2UgcHJldmlvdXMgYW5kIGN1cnJlbnQgZGlmZlxuXHRcdFx0XHRyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdID0gbmV3IFNlcXVlbmNlRGlmZihcblx0XHRcdFx0XHRuZXcgT2Zmc2V0UmFuZ2UocHJldlJlc3VsdC5zZXExUmFuZ2Uuc3RhcnQsIGN1ci5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlIC0gbGVuZ3RoKSxcblx0XHRcdFx0XHRuZXcgT2Zmc2V0UmFuZ2UocHJldlJlc3VsdC5zZXEyUmFuZ2Uuc3RhcnQsIGN1ci5zZXEyUmFuZ2UuZW5kRXhjbHVzaXZlIC0gbGVuZ3RoKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGN1ciA9IGN1ci5kZWx0YSgtZCk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2goY3VyKTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDI6IFNlcXVlbmNlRGlmZltdID0gW107XG5cdC8vIFRoZW4gbW92ZSB0aGVtIGFsbCB0byB0aGUgcmlnaHQgYW5kIGpvaW4gdGhlbSBhZ2FpbiBpZiBwb3NzaWJsZVxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc3VsdC5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRjb25zdCBuZXh0UmVzdWx0ID0gcmVzdWx0W2kgKyAxXTtcblx0XHRsZXQgY3VyID0gcmVzdWx0W2ldO1xuXG5cdFx0aWYgKGN1ci5zZXExUmFuZ2UuaXNFbXB0eSB8fCBjdXIuc2VxMlJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IG5leHRSZXN1bHQuc2VxMVJhbmdlLnN0YXJ0IC0gY3VyLnNlcTFSYW5nZS5lbmRFeGNsdXNpdmU7XG5cdFx0XHRsZXQgZDtcblx0XHRcdGZvciAoZCA9IDA7IGQgPCBsZW5ndGg7IGQrKykge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0IXNlcXVlbmNlMS5pc1N0cm9uZ2x5RXF1YWwoY3VyLnNlcTFSYW5nZS5zdGFydCArIGQsIGN1ci5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlICsgZCkgfHxcblx0XHRcdFx0XHQhc2VxdWVuY2UyLmlzU3Ryb25nbHlFcXVhbChjdXIuc2VxMlJhbmdlLnN0YXJ0ICsgZCwgY3VyLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgKyBkKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZCA9PT0gbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIE1lcmdlIHByZXZpb3VzIGFuZCBjdXJyZW50IGRpZmYsIHdyaXRlIHRvIHJlc3VsdCFcblx0XHRcdFx0cmVzdWx0W2kgKyAxXSA9IG5ldyBTZXF1ZW5jZURpZmYoXG5cdFx0XHRcdFx0bmV3IE9mZnNldFJhbmdlKGN1ci5zZXExUmFuZ2Uuc3RhcnQgKyBsZW5ndGgsIG5leHRSZXN1bHQuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSksXG5cdFx0XHRcdFx0bmV3IE9mZnNldFJhbmdlKGN1ci5zZXEyUmFuZ2Uuc3RhcnQgKyBsZW5ndGgsIG5leHRSZXN1bHQuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZCA+IDApIHtcblx0XHRcdFx0Y3VyID0gY3VyLmRlbHRhKGQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJlc3VsdDIucHVzaChjdXIpO1xuXHR9XG5cblx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0cmVzdWx0Mi5wdXNoKHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDI7XG59XG5cbi8vIGFsaWduIGNoYXJhY3RlciBsZXZlbCBkaWZmcyBhdCB3aGl0ZXNwYWNlIGNoYXJhY3RlcnNcbi8vIGltcG9ydCB7IElCYXIgfSBmcm9tIFwiZm9vXCI7XG4vLyBpbXBvcnQgeyBJW0FyciwgSV1CYXIgfSBmcm9tIFwiZm9vXCI7XG4vLyAtPlxuLy8gaW1wb3J0IHsgW0lBcnIsIF1JQmFyIH0gZnJvbSBcImZvb1wiO1xuXG4vLyBpbXBvcnQgeyBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICd2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlJztcbi8vIGltcG9ydCB7IElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVtGcm9tRXZlbnQsIG9ic2VydmFibGVdVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAndnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZSc7XG4vLyAtPlxuLy8gaW1wb3J0IHsgSVRyYW5zYWN0aW9uLCBbb2JzZXJ2YWJsZUZyb21FdmVudCwgXW9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICd2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlJztcblxuLy8gY29sbGVjdEJyYWNrZXRzKGxldmVsICsgMSwgbGV2ZWxQZXJCcmFja2V0VHlwZSk7XG4vLyBjb2xsZWN0QnJhY2tldHMobGV2ZWwgKyAxLCBsZXZlbFBlckJyYWNrZXRbICsgMSwgbGV2ZWxQZXJCcmFja2V0XVR5cGUpO1xuLy8gLT5cbi8vIGNvbGxlY3RCcmFja2V0cyhsZXZlbCArIDEsIFtsZXZlbFBlckJyYWNrZXQgKyAxLCBdbGV2ZWxQZXJCcmFja2V0VHlwZSk7XG5cbmZ1bmN0aW9uIHNoaWZ0U2VxdWVuY2VEaWZmcyhzZXF1ZW5jZTE6IElTZXF1ZW5jZSwgc2VxdWVuY2UyOiBJU2VxdWVuY2UsIHNlcXVlbmNlRGlmZnM6IFNlcXVlbmNlRGlmZltdKTogU2VxdWVuY2VEaWZmW10ge1xuXHRpZiAoIXNlcXVlbmNlMS5nZXRCb3VuZGFyeVNjb3JlIHx8ICFzZXF1ZW5jZTIuZ2V0Qm91bmRhcnlTY29yZSkge1xuXHRcdHJldHVybiBzZXF1ZW5jZURpZmZzO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZXF1ZW5jZURpZmZzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgcHJldkRpZmYgPSAoaSA+IDAgPyBzZXF1ZW5jZURpZmZzW2kgLSAxXSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZGlmZiA9IHNlcXVlbmNlRGlmZnNbaV07XG5cdFx0Y29uc3QgbmV4dERpZmYgPSAoaSArIDEgPCBzZXF1ZW5jZURpZmZzLmxlbmd0aCA/IHNlcXVlbmNlRGlmZnNbaSArIDFdIDogdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNlcTFWYWxpZFJhbmdlID0gbmV3IE9mZnNldFJhbmdlKHByZXZEaWZmID8gcHJldkRpZmYuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSArIDEgOiAwLCBuZXh0RGlmZiA/IG5leHREaWZmLnNlcTFSYW5nZS5zdGFydCAtIDEgOiBzZXF1ZW5jZTEubGVuZ3RoKTtcblx0XHRjb25zdCBzZXEyVmFsaWRSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShwcmV2RGlmZiA/IHByZXZEaWZmLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgKyAxIDogMCwgbmV4dERpZmYgPyBuZXh0RGlmZi5zZXEyUmFuZ2Uuc3RhcnQgLSAxIDogc2VxdWVuY2UyLmxlbmd0aCk7XG5cblx0XHRpZiAoZGlmZi5zZXExUmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0c2VxdWVuY2VEaWZmc1tpXSA9IHNoaWZ0RGlmZlRvQmV0dGVyUG9zaXRpb24oZGlmZiwgc2VxdWVuY2UxLCBzZXF1ZW5jZTIsIHNlcTFWYWxpZFJhbmdlLCBzZXEyVmFsaWRSYW5nZSk7XG5cdFx0fSBlbHNlIGlmIChkaWZmLnNlcTJSYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHRzZXF1ZW5jZURpZmZzW2ldID0gc2hpZnREaWZmVG9CZXR0ZXJQb3NpdGlvbihkaWZmLnN3YXAoKSwgc2VxdWVuY2UyLCBzZXF1ZW5jZTEsIHNlcTJWYWxpZFJhbmdlLCBzZXExVmFsaWRSYW5nZSkuc3dhcCgpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBzZXF1ZW5jZURpZmZzO1xufVxuXG5mdW5jdGlvbiBzaGlmdERpZmZUb0JldHRlclBvc2l0aW9uKGRpZmY6IFNlcXVlbmNlRGlmZiwgc2VxdWVuY2UxOiBJU2VxdWVuY2UsIHNlcXVlbmNlMjogSVNlcXVlbmNlLCBzZXExVmFsaWRSYW5nZTogT2Zmc2V0UmFuZ2UsIHNlcTJWYWxpZFJhbmdlOiBPZmZzZXRSYW5nZSwpIHtcblx0Y29uc3QgbWF4U2hpZnRMaW1pdCA9IDEwMDsgLy8gVG8gcHJldmVudCBwZXJmb3JtYW5jZSBpc3N1ZXNcblxuXHQvLyBkb24ndCB0b3VjaCBwcmV2aW91cyBvciBuZXh0IVxuXHRsZXQgZGVsdGFCZWZvcmUgPSAxO1xuXHR3aGlsZSAoXG5cdFx0ZGlmZi5zZXExUmFuZ2Uuc3RhcnQgLSBkZWx0YUJlZm9yZSA+PSBzZXExVmFsaWRSYW5nZS5zdGFydCAmJlxuXHRcdGRpZmYuc2VxMlJhbmdlLnN0YXJ0IC0gZGVsdGFCZWZvcmUgPj0gc2VxMlZhbGlkUmFuZ2Uuc3RhcnQgJiZcblx0XHRzZXF1ZW5jZTIuaXNTdHJvbmdseUVxdWFsKGRpZmYuc2VxMlJhbmdlLnN0YXJ0IC0gZGVsdGFCZWZvcmUsIGRpZmYuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSAtIGRlbHRhQmVmb3JlKSAmJiBkZWx0YUJlZm9yZSA8IG1heFNoaWZ0TGltaXRcblx0KSB7XG5cdFx0ZGVsdGFCZWZvcmUrKztcblx0fVxuXHRkZWx0YUJlZm9yZS0tO1xuXG5cdGxldCBkZWx0YUFmdGVyID0gMDtcblx0d2hpbGUgKFxuXHRcdGRpZmYuc2VxMVJhbmdlLnN0YXJ0ICsgZGVsdGFBZnRlciA8IHNlcTFWYWxpZFJhbmdlLmVuZEV4Y2x1c2l2ZSAmJlxuXHRcdGRpZmYuc2VxMlJhbmdlLmVuZEV4Y2x1c2l2ZSArIGRlbHRhQWZ0ZXIgPCBzZXEyVmFsaWRSYW5nZS5lbmRFeGNsdXNpdmUgJiZcblx0XHRzZXF1ZW5jZTIuaXNTdHJvbmdseUVxdWFsKGRpZmYuc2VxMlJhbmdlLnN0YXJ0ICsgZGVsdGFBZnRlciwgZGlmZi5zZXEyUmFuZ2UuZW5kRXhjbHVzaXZlICsgZGVsdGFBZnRlcikgJiYgZGVsdGFBZnRlciA8IG1heFNoaWZ0TGltaXRcblx0KSB7XG5cdFx0ZGVsdGFBZnRlcisrO1xuXHR9XG5cblx0aWYgKGRlbHRhQmVmb3JlID09PSAwICYmIGRlbHRhQWZ0ZXIgPT09IDApIHtcblx0XHRyZXR1cm4gZGlmZjtcblx0fVxuXG5cdC8vIFZpc3VhbGl6ZSBgW3NlcXVlbmNlMS50ZXh0LCBkaWZmLnNlcTFSYW5nZS5zdGFydCArIGRlbHRhQWZ0ZXJdYFxuXHQvLyBhbmQgYFtzZXF1ZW5jZTIudGV4dCwgZGlmZi5zZXEyUmFuZ2Uuc3RhcnQgKyBkZWx0YUFmdGVyLCBkaWZmLnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgKyBkZWx0YUFmdGVyXWBcblxuXHRsZXQgYmVzdERlbHRhID0gMDtcblx0bGV0IGJlc3RTY29yZSA9IC0xO1xuXHQvLyBmaW5kIGJlc3Qgc2NvcmVkIGRlbHRhXG5cdGZvciAobGV0IGRlbHRhID0gLWRlbHRhQmVmb3JlOyBkZWx0YSA8PSBkZWx0YUFmdGVyOyBkZWx0YSsrKSB7XG5cdFx0Y29uc3Qgc2VxMk9mZnNldFN0YXJ0ID0gZGlmZi5zZXEyUmFuZ2Uuc3RhcnQgKyBkZWx0YTtcblx0XHRjb25zdCBzZXEyT2Zmc2V0RW5kRXhjbHVzaXZlID0gZGlmZi5zZXEyUmFuZ2UuZW5kRXhjbHVzaXZlICsgZGVsdGE7XG5cdFx0Y29uc3Qgc2VxMU9mZnNldCA9IGRpZmYuc2VxMVJhbmdlLnN0YXJ0ICsgZGVsdGE7XG5cblx0XHRjb25zdCBzY29yZSA9IHNlcXVlbmNlMS5nZXRCb3VuZGFyeVNjb3JlIShzZXExT2Zmc2V0KSArIHNlcXVlbmNlMi5nZXRCb3VuZGFyeVNjb3JlIShzZXEyT2Zmc2V0U3RhcnQpICsgc2VxdWVuY2UyLmdldEJvdW5kYXJ5U2NvcmUhKHNlcTJPZmZzZXRFbmRFeGNsdXNpdmUpO1xuXHRcdGlmIChzY29yZSA+IGJlc3RTY29yZSkge1xuXHRcdFx0YmVzdFNjb3JlID0gc2NvcmU7XG5cdFx0XHRiZXN0RGVsdGEgPSBkZWx0YTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZGlmZi5kZWx0YShiZXN0RGVsdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlU2hvcnRNYXRjaGVzKHNlcXVlbmNlMTogSVNlcXVlbmNlLCBzZXF1ZW5jZTI6IElTZXF1ZW5jZSwgc2VxdWVuY2VEaWZmczogU2VxdWVuY2VEaWZmW10pOiBTZXF1ZW5jZURpZmZbXSB7XG5cdGNvbnN0IHJlc3VsdDogU2VxdWVuY2VEaWZmW10gPSBbXTtcblx0Zm9yIChjb25zdCBzIG9mIHNlcXVlbmNlRGlmZnMpIHtcblx0XHRjb25zdCBsYXN0ID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcblx0XHRpZiAoIWxhc3QpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHMpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKHMuc2VxMVJhbmdlLnN0YXJ0IC0gbGFzdC5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlIDw9IDIgfHwgcy5zZXEyUmFuZ2Uuc3RhcnQgLSBsYXN0LnNlcTJSYW5nZS5lbmRFeGNsdXNpdmUgPD0gMikge1xuXHRcdFx0cmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSA9IG5ldyBTZXF1ZW5jZURpZmYobGFzdC5zZXExUmFuZ2Uuam9pbihzLnNlcTFSYW5nZSksIGxhc3Quc2VxMlJhbmdlLmpvaW4ocy5zZXEyUmFuZ2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2gocyk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dGVuZERpZmZzVG9FbnRpcmVXb3JkSWZBcHByb3ByaWF0ZShcblx0c2VxdWVuY2UxOiBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlLFxuXHRzZXF1ZW5jZTI6IExpbmVzU2xpY2VDaGFyU2VxdWVuY2UsXG5cdHNlcXVlbmNlRGlmZnM6IFNlcXVlbmNlRGlmZltdLFxuXHRmaW5kUGFyZW50OiAoc2VxOiBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlLCBpZHg6IG51bWJlcikgPT4gT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQsXG5cdGZvcmNlOiBib29sZWFuID0gZmFsc2UsXG4pOiBTZXF1ZW5jZURpZmZbXSB7XG5cdGNvbnN0IGVxdWFsTWFwcGluZ3MgPSBTZXF1ZW5jZURpZmYuaW52ZXJ0KHNlcXVlbmNlRGlmZnMsIHNlcXVlbmNlMS5sZW5ndGgpO1xuXG5cdGNvbnN0IGFkZGl0aW9uYWw6IFNlcXVlbmNlRGlmZltdID0gW107XG5cblx0bGV0IGxhc3RQb2ludCA9IG5ldyBPZmZzZXRQYWlyKDAsIDApO1xuXG5cdGZ1bmN0aW9uIHNjYW5Xb3JkKHBhaXI6IE9mZnNldFBhaXIsIGVxdWFsTWFwcGluZzogU2VxdWVuY2VEaWZmKSB7XG5cdFx0aWYgKHBhaXIub2Zmc2V0MSA8IGxhc3RQb2ludC5vZmZzZXQxIHx8IHBhaXIub2Zmc2V0MiA8IGxhc3RQb2ludC5vZmZzZXQyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdzEgPSBmaW5kUGFyZW50KHNlcXVlbmNlMSwgcGFpci5vZmZzZXQxKTtcblx0XHRjb25zdCB3MiA9IGZpbmRQYXJlbnQoc2VxdWVuY2UyLCBwYWlyLm9mZnNldDIpO1xuXHRcdGlmICghdzEgfHwgIXcyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCB3ID0gbmV3IFNlcXVlbmNlRGlmZih3MSwgdzIpO1xuXHRcdGNvbnN0IGVxdWFsUGFydCA9IHcuaW50ZXJzZWN0KGVxdWFsTWFwcGluZykhO1xuXG5cdFx0bGV0IGVxdWFsQ2hhcnMxID0gZXF1YWxQYXJ0LnNlcTFSYW5nZS5sZW5ndGg7XG5cdFx0bGV0IGVxdWFsQ2hhcnMyID0gZXF1YWxQYXJ0LnNlcTJSYW5nZS5sZW5ndGg7XG5cblx0XHQvLyBUaGUgd29yZHMgZG8gbm90IHRvdWNoIHByZXZpb3VzIGVxdWFscyBtYXBwaW5ncywgYXMgd2Ugd291bGQgaGF2ZSBwcm9jZXNzZWQgdGhlbSBhbHJlYWR5LlxuXHRcdC8vIEJ1dCB0aGV5IG1pZ2h0IHRvdWNoIHRoZSBuZXh0IG9uZXMuXG5cblx0XHR3aGlsZSAoZXF1YWxNYXBwaW5ncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gZXF1YWxNYXBwaW5nc1swXTtcblx0XHRcdGNvbnN0IGludGVyc2VjdHMgPSBuZXh0LnNlcTFSYW5nZS5pbnRlcnNlY3RzKHcuc2VxMVJhbmdlKSB8fCBuZXh0LnNlcTJSYW5nZS5pbnRlcnNlY3RzKHcuc2VxMlJhbmdlKTtcblx0XHRcdGlmICghaW50ZXJzZWN0cykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdjEgPSBmaW5kUGFyZW50KHNlcXVlbmNlMSwgbmV4dC5zZXExUmFuZ2Uuc3RhcnQpO1xuXHRcdFx0Y29uc3QgdjIgPSBmaW5kUGFyZW50KHNlcXVlbmNlMiwgbmV4dC5zZXEyUmFuZ2Uuc3RhcnQpO1xuXHRcdFx0Ly8gQmVjYXVzZSB0aGVyZSBpcyBhbiBpbnRlcnNlY3Rpb24sIHdlIGtub3cgdGhhdCB0aGUgd29yZHMgYXJlIG5vdCBlbXB0eS5cblx0XHRcdGNvbnN0IHYgPSBuZXcgU2VxdWVuY2VEaWZmKHYxISwgdjIhKTtcblx0XHRcdGNvbnN0IGVxdWFsUGFydCA9IHYuaW50ZXJzZWN0KG5leHQpITtcblxuXHRcdFx0ZXF1YWxDaGFyczEgKz0gZXF1YWxQYXJ0LnNlcTFSYW5nZS5sZW5ndGg7XG5cdFx0XHRlcXVhbENoYXJzMiArPSBlcXVhbFBhcnQuc2VxMlJhbmdlLmxlbmd0aDtcblxuXHRcdFx0dyA9IHcuam9pbih2KTtcblxuXHRcdFx0aWYgKHcuc2VxMVJhbmdlLmVuZEV4Y2x1c2l2ZSA+PSBuZXh0LnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0Ly8gVGhlIHdvcmQgZXh0ZW5kcyBiZXlvbmQgdGhlIG5leHQgZXF1YWwgbWFwcGluZy5cblx0XHRcdFx0ZXF1YWxNYXBwaW5ncy5zaGlmdCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKChmb3JjZSAmJiBlcXVhbENoYXJzMSArIGVxdWFsQ2hhcnMyIDwgdy5zZXExUmFuZ2UubGVuZ3RoICsgdy5zZXEyUmFuZ2UubGVuZ3RoKSB8fCBlcXVhbENoYXJzMSArIGVxdWFsQ2hhcnMyIDwgKHcuc2VxMVJhbmdlLmxlbmd0aCArIHcuc2VxMlJhbmdlLmxlbmd0aCkgKiAyIC8gMykge1xuXHRcdFx0YWRkaXRpb25hbC5wdXNoKHcpO1xuXHRcdH1cblxuXHRcdGxhc3RQb2ludCA9IHcuZ2V0RW5kRXhjbHVzaXZlcygpO1xuXHR9XG5cblx0d2hpbGUgKGVxdWFsTWFwcGluZ3MubGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IG5leHQgPSBlcXVhbE1hcHBpbmdzLnNoaWZ0KCkhO1xuXHRcdGlmIChuZXh0LnNlcTFSYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2NhbldvcmQobmV4dC5nZXRTdGFydHMoKSwgbmV4dCk7XG5cdFx0Ly8gVGhlIGVxdWFsIHBhcnRzIGFyZSBub3QgZW1wdHksIHNvIC0xIGdpdmVzIHVzIGEgY2hhcmFjdGVyIHRoYXQgaXMgZXF1YWwgaW4gYm90aCBwYXJ0cy5cblx0XHRzY2FuV29yZChuZXh0LmdldEVuZEV4Y2x1c2l2ZXMoKS5kZWx0YSgtMSksIG5leHQpO1xuXHR9XG5cblx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VTZXF1ZW5jZURpZmZzKHNlcXVlbmNlRGlmZnMsIGFkZGl0aW9uYWwpO1xuXHRyZXR1cm4gbWVyZ2VkO1xufVxuXG5mdW5jdGlvbiBtZXJnZVNlcXVlbmNlRGlmZnMoc2VxdWVuY2VEaWZmczE6IFNlcXVlbmNlRGlmZltdLCBzZXF1ZW5jZURpZmZzMjogU2VxdWVuY2VEaWZmW10pOiBTZXF1ZW5jZURpZmZbXSB7XG5cdGNvbnN0IHJlc3VsdDogU2VxdWVuY2VEaWZmW10gPSBbXTtcblxuXHR3aGlsZSAoc2VxdWVuY2VEaWZmczEubGVuZ3RoID4gMCB8fCBzZXF1ZW5jZURpZmZzMi5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3Qgc2QxID0gc2VxdWVuY2VEaWZmczFbMF07XG5cdFx0Y29uc3Qgc2QyID0gc2VxdWVuY2VEaWZmczJbMF07XG5cblx0XHRsZXQgbmV4dDogU2VxdWVuY2VEaWZmO1xuXHRcdGlmIChzZDEgJiYgKCFzZDIgfHwgc2QxLnNlcTFSYW5nZS5zdGFydCA8IHNkMi5zZXExUmFuZ2Uuc3RhcnQpKSB7XG5cdFx0XHRuZXh0ID0gc2VxdWVuY2VEaWZmczEuc2hpZnQoKSE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5leHQgPSBzZXF1ZW5jZURpZmZzMi5zaGlmdCgpITtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDAgJiYgcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXS5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlID49IG5leHQuc2VxMVJhbmdlLnN0YXJ0KSB7XG5cdFx0XHRyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXS5qb2luKG5leHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQucHVzaChuZXh0KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVmVyeVNob3J0TWF0Y2hpbmdMaW5lc0JldHdlZW5EaWZmcyhzZXF1ZW5jZTE6IExpbmVTZXF1ZW5jZSwgX3NlcXVlbmNlMjogTGluZVNlcXVlbmNlLCBzZXF1ZW5jZURpZmZzOiBTZXF1ZW5jZURpZmZbXSk6IFNlcXVlbmNlRGlmZltdIHtcblx0bGV0IGRpZmZzID0gc2VxdWVuY2VEaWZmcztcblx0aWYgKGRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBkaWZmcztcblx0fVxuXG5cdGxldCBjb3VudGVyID0gMDtcblx0bGV0IHNob3VsZFJlcGVhdDogYm9vbGVhbjtcblx0ZG8ge1xuXHRcdHNob3VsZFJlcGVhdCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBTZXF1ZW5jZURpZmZbXSA9IFtcblx0XHRcdGRpZmZzWzBdXG5cdFx0XTtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZGlmZnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1ciA9IGRpZmZzW2ldO1xuXHRcdFx0Y29uc3QgbGFzdFJlc3VsdCA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG5cblx0XHRcdGZ1bmN0aW9uIHNob3VsZEpvaW5EaWZmcyhiZWZvcmU6IFNlcXVlbmNlRGlmZiwgYWZ0ZXI6IFNlcXVlbmNlRGlmZik6IGJvb2xlYW4ge1xuXHRcdFx0XHRjb25zdCB1bmNoYW5nZWRSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShsYXN0UmVzdWx0LnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUsIGN1ci5zZXExUmFuZ2Uuc3RhcnQpO1xuXG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZFRleHQgPSBzZXF1ZW5jZTEuZ2V0VGV4dCh1bmNoYW5nZWRSYW5nZSk7XG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZFRleHRXaXRob3V0V3MgPSB1bmNoYW5nZWRUZXh0LnJlcGxhY2UoL1xccy9nLCAnJyk7XG5cdFx0XHRcdGlmICh1bmNoYW5nZWRUZXh0V2l0aG91dFdzLmxlbmd0aCA8PSA0XG5cdFx0XHRcdFx0JiYgKGJlZm9yZS5zZXExUmFuZ2UubGVuZ3RoICsgYmVmb3JlLnNlcTJSYW5nZS5sZW5ndGggPiA1IHx8IGFmdGVyLnNlcTFSYW5nZS5sZW5ndGggKyBhZnRlci5zZXEyUmFuZ2UubGVuZ3RoID4gNSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hvdWxkSm9pbiA9IHNob3VsZEpvaW5EaWZmcyhsYXN0UmVzdWx0LCBjdXIpO1xuXHRcdFx0aWYgKHNob3VsZEpvaW4pIHtcblx0XHRcdFx0c2hvdWxkUmVwZWF0ID0gdHJ1ZTtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0uam9pbihjdXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goY3VyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaWZmcyA9IHJlc3VsdDtcblx0fSB3aGlsZSAoY291bnRlcisrIDwgMTAgJiYgc2hvdWxkUmVwZWF0KTtcblxuXHRyZXR1cm4gZGlmZnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVWZXJ5U2hvcnRNYXRjaGluZ1RleHRCZXR3ZWVuTG9uZ0RpZmZzKHNlcXVlbmNlMTogTGluZXNTbGljZUNoYXJTZXF1ZW5jZSwgc2VxdWVuY2UyOiBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlLCBzZXF1ZW5jZURpZmZzOiBTZXF1ZW5jZURpZmZbXSk6IFNlcXVlbmNlRGlmZltdIHtcblx0bGV0IGRpZmZzID0gc2VxdWVuY2VEaWZmcztcblx0aWYgKGRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBkaWZmcztcblx0fVxuXG5cdGxldCBjb3VudGVyID0gMDtcblx0bGV0IHNob3VsZFJlcGVhdDogYm9vbGVhbjtcblx0ZG8ge1xuXHRcdHNob3VsZFJlcGVhdCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBTZXF1ZW5jZURpZmZbXSA9IFtcblx0XHRcdGRpZmZzWzBdXG5cdFx0XTtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZGlmZnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1ciA9IGRpZmZzW2ldO1xuXHRcdFx0Y29uc3QgbGFzdFJlc3VsdCA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG5cblx0XHRcdGZ1bmN0aW9uIHNob3VsZEpvaW5EaWZmcyhiZWZvcmU6IFNlcXVlbmNlRGlmZiwgYWZ0ZXI6IFNlcXVlbmNlRGlmZik6IGJvb2xlYW4ge1xuXHRcdFx0XHRjb25zdCB1bmNoYW5nZWRSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShsYXN0UmVzdWx0LnNlcTFSYW5nZS5lbmRFeGNsdXNpdmUsIGN1ci5zZXExUmFuZ2Uuc3RhcnQpO1xuXG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZExpbmVDb3VudCA9IHNlcXVlbmNlMS5jb3VudExpbmVzSW4odW5jaGFuZ2VkUmFuZ2UpO1xuXHRcdFx0XHRpZiAodW5jaGFuZ2VkTGluZUNvdW50ID4gNSB8fCB1bmNoYW5nZWRSYW5nZS5sZW5ndGggPiA1MDApIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1bmNoYW5nZWRUZXh0ID0gc2VxdWVuY2UxLmdldFRleHQodW5jaGFuZ2VkUmFuZ2UpLnRyaW0oKTtcblx0XHRcdFx0aWYgKHVuY2hhbmdlZFRleHQubGVuZ3RoID4gMjAgfHwgdW5jaGFuZ2VkVGV4dC5zcGxpdCgvXFxyXFxufFxccnxcXG4vKS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYmVmb3JlTGluZUNvdW50MSA9IHNlcXVlbmNlMS5jb3VudExpbmVzSW4oYmVmb3JlLnNlcTFSYW5nZSk7XG5cdFx0XHRcdGNvbnN0IGJlZm9yZVNlcTFMZW5ndGggPSBiZWZvcmUuc2VxMVJhbmdlLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgYmVmb3JlTGluZUNvdW50MiA9IHNlcXVlbmNlMi5jb3VudExpbmVzSW4oYmVmb3JlLnNlcTJSYW5nZSk7XG5cdFx0XHRcdGNvbnN0IGJlZm9yZVNlcTJMZW5ndGggPSBiZWZvcmUuc2VxMlJhbmdlLmxlbmd0aDtcblxuXHRcdFx0XHRjb25zdCBhZnRlckxpbmVDb3VudDEgPSBzZXF1ZW5jZTEuY291bnRMaW5lc0luKGFmdGVyLnNlcTFSYW5nZSk7XG5cdFx0XHRcdGNvbnN0IGFmdGVyU2VxMUxlbmd0aCA9IGFmdGVyLnNlcTFSYW5nZS5sZW5ndGg7XG5cdFx0XHRcdGNvbnN0IGFmdGVyTGluZUNvdW50MiA9IHNlcXVlbmNlMi5jb3VudExpbmVzSW4oYWZ0ZXIuc2VxMlJhbmdlKTtcblx0XHRcdFx0Y29uc3QgYWZ0ZXJTZXEyTGVuZ3RoID0gYWZ0ZXIuc2VxMlJhbmdlLmxlbmd0aDtcblxuXHRcdFx0XHQvLyBUT0RPOiBNYXliZSBhIG5ldXJhbCBuZXQgY2FuIGJlIHVzZWQgdG8gZGVyaXZlIHRoZSByZXN1bHQgZnJvbSB0aGVzZSBudW1iZXJzXG5cblx0XHRcdFx0Y29uc3QgbWF4ID0gMiAqIDQwICsgNTA7XG5cdFx0XHRcdGZ1bmN0aW9uIGNhcCh2OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRcdHJldHVybiBNYXRoLm1pbih2LCBtYXgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKE1hdGgucG93KE1hdGgucG93KGNhcChiZWZvcmVMaW5lQ291bnQxICogNDAgKyBiZWZvcmVTZXExTGVuZ3RoKSwgMS41KSArIE1hdGgucG93KGNhcChiZWZvcmVMaW5lQ291bnQyICogNDAgKyBiZWZvcmVTZXEyTGVuZ3RoKSwgMS41KSwgMS41KVxuXHRcdFx0XHRcdCsgTWF0aC5wb3coTWF0aC5wb3coY2FwKGFmdGVyTGluZUNvdW50MSAqIDQwICsgYWZ0ZXJTZXExTGVuZ3RoKSwgMS41KSArIE1hdGgucG93KGNhcChhZnRlckxpbmVDb3VudDIgKiA0MCArIGFmdGVyU2VxMkxlbmd0aCksIDEuNSksIDEuNSkgPiAoKG1heCAqKiAxLjUpICoqIDEuNSkgKiAxLjMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNob3VsZEpvaW4gPSBzaG91bGRKb2luRGlmZnMobGFzdFJlc3VsdCwgY3VyKTtcblx0XHRcdGlmIChzaG91bGRKb2luKSB7XG5cdFx0XHRcdHNob3VsZFJlcGVhdCA9IHRydWU7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0gPSByZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdLmpvaW4oY3VyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGN1cik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZGlmZnMgPSByZXN1bHQ7XG5cdH0gd2hpbGUgKGNvdW50ZXIrKyA8IDEwICYmIHNob3VsZFJlcGVhdCk7XG5cblx0Y29uc3QgbmV3RGlmZnM6IFNlcXVlbmNlRGlmZltdID0gW107XG5cblx0Ly8gUmVtb3ZlIHNob3J0IHN1ZmZpeGVzL3ByZWZpeGVzXG5cdGZvckVhY2hXaXRoTmVpZ2hib3JzKGRpZmZzLCAocHJldiwgY3VyLCBuZXh0KSA9PiB7XG5cdFx0bGV0IG5ld0RpZmYgPSBjdXI7XG5cblx0XHRmdW5jdGlvbiBzaG91bGRNYXJrQXNDaGFuZ2VkKHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHRleHQubGVuZ3RoID4gMCAmJiB0ZXh0LnRyaW0oKS5sZW5ndGggPD0gMyAmJiBjdXIuc2VxMVJhbmdlLmxlbmd0aCArIGN1ci5zZXEyUmFuZ2UubGVuZ3RoID4gMTAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZ1bGxSYW5nZTEgPSBzZXF1ZW5jZTEuZXh0ZW5kVG9GdWxsTGluZXMoY3VyLnNlcTFSYW5nZSk7XG5cdFx0Y29uc3QgcHJlZml4ID0gc2VxdWVuY2UxLmdldFRleHQobmV3IE9mZnNldFJhbmdlKGZ1bGxSYW5nZTEuc3RhcnQsIGN1ci5zZXExUmFuZ2Uuc3RhcnQpKTtcblx0XHRpZiAoc2hvdWxkTWFya0FzQ2hhbmdlZChwcmVmaXgpKSB7XG5cdFx0XHRuZXdEaWZmID0gbmV3RGlmZi5kZWx0YVN0YXJ0KC1wcmVmaXgubGVuZ3RoKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3VmZml4ID0gc2VxdWVuY2UxLmdldFRleHQobmV3IE9mZnNldFJhbmdlKGN1ci5zZXExUmFuZ2UuZW5kRXhjbHVzaXZlLCBmdWxsUmFuZ2UxLmVuZEV4Y2x1c2l2ZSkpO1xuXHRcdGlmIChzaG91bGRNYXJrQXNDaGFuZ2VkKHN1ZmZpeCkpIHtcblx0XHRcdG5ld0RpZmYgPSBuZXdEaWZmLmRlbHRhRW5kKHN1ZmZpeC5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF2YWlsYWJsZVNwYWNlID0gU2VxdWVuY2VEaWZmLmZyb21PZmZzZXRQYWlycyhcblx0XHRcdHByZXYgPyBwcmV2LmdldEVuZEV4Y2x1c2l2ZXMoKSA6IE9mZnNldFBhaXIuemVybyxcblx0XHRcdG5leHQgPyBuZXh0LmdldFN0YXJ0cygpIDogT2Zmc2V0UGFpci5tYXgsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXdEaWZmLmludGVyc2VjdChhdmFpbGFibGVTcGFjZSkhO1xuXHRcdGlmIChuZXdEaWZmcy5sZW5ndGggPiAwICYmIHJlc3VsdC5nZXRTdGFydHMoKS5lcXVhbHMobmV3RGlmZnNbbmV3RGlmZnMubGVuZ3RoIC0gMV0uZ2V0RW5kRXhjbHVzaXZlcygpKSkge1xuXHRcdFx0bmV3RGlmZnNbbmV3RGlmZnMubGVuZ3RoIC0gMV0gPSBuZXdEaWZmc1tuZXdEaWZmcy5sZW5ndGggLSAxXS5qb2luKHJlc3VsdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld0RpZmZzLnB1c2gocmVzdWx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBuZXdEaWZmcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQW9CLFlBQVksb0JBQW9CO0FBSTdDLFNBQVMsc0JBQXNCLFdBQXNCLFdBQXNCLGVBQStDO0FBQ2hJLE1BQUksU0FBUztBQUNiLFdBQVMsNEJBQTRCLFdBQVcsV0FBVyxNQUFNO0FBR2pFLFdBQVMsNEJBQTRCLFdBQVcsV0FBVyxNQUFNO0FBQ2pFLFdBQVMsbUJBQW1CLFdBQVcsV0FBVyxNQUFNO0FBQ3hELFNBQU87QUFDUjtBQWNBLFNBQVMsNEJBQTRCLFdBQXNCLFdBQXNCLGVBQStDO0FBQy9ILE1BQUksY0FBYyxXQUFXLEdBQUc7QUFDL0IsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFNBQXlCLENBQUM7QUFDaEMsU0FBTyxLQUFLLGNBQWMsQ0FBQyxDQUFDO0FBRzVCLFdBQVMsSUFBSSxHQUFHLElBQUksY0FBYyxRQUFRLEtBQUs7QUFDOUMsVUFBTSxhQUFhLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFDM0MsUUFBSSxNQUFNLGNBQWMsQ0FBQztBQUV6QixRQUFJLElBQUksVUFBVSxXQUFXLElBQUksVUFBVSxTQUFTO0FBQ25ELFlBQU0sU0FBUyxJQUFJLFVBQVUsUUFBUSxXQUFXLFVBQVU7QUFDMUQsVUFBSTtBQUNKLFdBQUssSUFBSSxHQUFHLEtBQUssUUFBUSxLQUFLO0FBQzdCLFlBQ0MsVUFBVSxXQUFXLElBQUksVUFBVSxRQUFRLENBQUMsTUFBTSxVQUFVLFdBQVcsSUFBSSxVQUFVLGVBQWUsQ0FBQyxLQUNyRyxVQUFVLFdBQVcsSUFBSSxVQUFVLFFBQVEsQ0FBQyxNQUFNLFVBQVUsV0FBVyxJQUFJLFVBQVUsZUFBZSxDQUFDLEdBQUc7QUFDeEc7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBO0FBRUEsVUFBSSxNQUFNLFFBQVE7QUFFakIsZUFBTyxPQUFPLFNBQVMsQ0FBQyxJQUFJLElBQUk7QUFBQSxVQUMvQixJQUFJLFlBQVksV0FBVyxVQUFVLE9BQU8sSUFBSSxVQUFVLGVBQWUsTUFBTTtBQUFBLFVBQy9FLElBQUksWUFBWSxXQUFXLFVBQVUsT0FBTyxJQUFJLFVBQVUsZUFBZSxNQUFNO0FBQUEsUUFDaEY7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxZQUFNLElBQUksTUFBTSxDQUFDLENBQUM7QUFBQSxJQUNuQjtBQUVBLFdBQU8sS0FBSyxHQUFHO0FBQUEsRUFDaEI7QUFFQSxRQUFNLFVBQTBCLENBQUM7QUFFakMsV0FBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFNBQVMsR0FBRyxLQUFLO0FBQzNDLFVBQU0sYUFBYSxPQUFPLElBQUksQ0FBQztBQUMvQixRQUFJLE1BQU0sT0FBTyxDQUFDO0FBRWxCLFFBQUksSUFBSSxVQUFVLFdBQVcsSUFBSSxVQUFVLFNBQVM7QUFDbkQsWUFBTSxTQUFTLFdBQVcsVUFBVSxRQUFRLElBQUksVUFBVTtBQUMxRCxVQUFJO0FBQ0osV0FBSyxJQUFJLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDNUIsWUFDQyxDQUFDLFVBQVUsZ0JBQWdCLElBQUksVUFBVSxRQUFRLEdBQUcsSUFBSSxVQUFVLGVBQWUsQ0FBQyxLQUNsRixDQUFDLFVBQVUsZ0JBQWdCLElBQUksVUFBVSxRQUFRLEdBQUcsSUFBSSxVQUFVLGVBQWUsQ0FBQyxHQUNqRjtBQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLE1BQU0sUUFBUTtBQUVqQixlQUFPLElBQUksQ0FBQyxJQUFJLElBQUk7QUFBQSxVQUNuQixJQUFJLFlBQVksSUFBSSxVQUFVLFFBQVEsUUFBUSxXQUFXLFVBQVUsWUFBWTtBQUFBLFVBQy9FLElBQUksWUFBWSxJQUFJLFVBQVUsUUFBUSxRQUFRLFdBQVcsVUFBVSxZQUFZO0FBQUEsUUFDaEY7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxVQUFJLElBQUksR0FBRztBQUNWLGNBQU0sSUFBSSxNQUFNLENBQUM7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxZQUFRLEtBQUssR0FBRztBQUFBLEVBQ2pCO0FBRUEsTUFBSSxPQUFPLFNBQVMsR0FBRztBQUN0QixZQUFRLEtBQUssT0FBTyxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDdkM7QUFFQSxTQUFPO0FBQ1I7QUFrQkEsU0FBUyxtQkFBbUIsV0FBc0IsV0FBc0IsZUFBK0M7QUFDdEgsTUFBSSxDQUFDLFVBQVUsb0JBQW9CLENBQUMsVUFBVSxrQkFBa0I7QUFDL0QsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLElBQUksR0FBRyxJQUFJLGNBQWMsUUFBUSxLQUFLO0FBQzlDLFVBQU0sV0FBWSxJQUFJLElBQUksY0FBYyxJQUFJLENBQUMsSUFBSTtBQUNqRCxVQUFNLE9BQU8sY0FBYyxDQUFDO0FBQzVCLFVBQU0sV0FBWSxJQUFJLElBQUksY0FBYyxTQUFTLGNBQWMsSUFBSSxDQUFDLElBQUk7QUFFeEUsVUFBTSxpQkFBaUIsSUFBSSxZQUFZLFdBQVcsU0FBUyxVQUFVLGVBQWUsSUFBSSxHQUFHLFdBQVcsU0FBUyxVQUFVLFFBQVEsSUFBSSxVQUFVLE1BQU07QUFDckosVUFBTSxpQkFBaUIsSUFBSSxZQUFZLFdBQVcsU0FBUyxVQUFVLGVBQWUsSUFBSSxHQUFHLFdBQVcsU0FBUyxVQUFVLFFBQVEsSUFBSSxVQUFVLE1BQU07QUFFckosUUFBSSxLQUFLLFVBQVUsU0FBUztBQUMzQixvQkFBYyxDQUFDLElBQUksMEJBQTBCLE1BQU0sV0FBVyxXQUFXLGdCQUFnQixjQUFjO0FBQUEsSUFDeEcsV0FBVyxLQUFLLFVBQVUsU0FBUztBQUNsQyxvQkFBYyxDQUFDLElBQUksMEJBQTBCLEtBQUssS0FBSyxHQUFHLFdBQVcsV0FBVyxnQkFBZ0IsY0FBYyxFQUFFLEtBQUs7QUFBQSxJQUN0SDtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLDBCQUEwQixNQUFvQixXQUFzQixXQUFzQixnQkFBNkIsZ0JBQThCO0FBQzdKLFFBQU0sZ0JBQWdCO0FBR3RCLE1BQUksY0FBYztBQUNsQixTQUNDLEtBQUssVUFBVSxRQUFRLGVBQWUsZUFBZSxTQUNyRCxLQUFLLFVBQVUsUUFBUSxlQUFlLGVBQWUsU0FDckQsVUFBVSxnQkFBZ0IsS0FBSyxVQUFVLFFBQVEsYUFBYSxLQUFLLFVBQVUsZUFBZSxXQUFXLEtBQUssY0FBYyxlQUN6SDtBQUNEO0FBQUEsRUFDRDtBQUNBO0FBRUEsTUFBSSxhQUFhO0FBQ2pCLFNBQ0MsS0FBSyxVQUFVLFFBQVEsYUFBYSxlQUFlLGdCQUNuRCxLQUFLLFVBQVUsZUFBZSxhQUFhLGVBQWUsZ0JBQzFELFVBQVUsZ0JBQWdCLEtBQUssVUFBVSxRQUFRLFlBQVksS0FBSyxVQUFVLGVBQWUsVUFBVSxLQUFLLGFBQWEsZUFDdEg7QUFDRDtBQUFBLEVBQ0Q7QUFFQSxNQUFJLGdCQUFnQixLQUFLLGVBQWUsR0FBRztBQUMxQyxXQUFPO0FBQUEsRUFDUjtBQUtBLE1BQUksWUFBWTtBQUNoQixNQUFJLFlBQVk7QUFFaEIsV0FBUyxRQUFRLENBQUMsYUFBYSxTQUFTLFlBQVksU0FBUztBQUM1RCxVQUFNLGtCQUFrQixLQUFLLFVBQVUsUUFBUTtBQUMvQyxVQUFNLHlCQUF5QixLQUFLLFVBQVUsZUFBZTtBQUM3RCxVQUFNLGFBQWEsS0FBSyxVQUFVLFFBQVE7QUFFMUMsVUFBTSxRQUFRLFVBQVUsaUJBQWtCLFVBQVUsSUFBSSxVQUFVLGlCQUFrQixlQUFlLElBQUksVUFBVSxpQkFBa0Isc0JBQXNCO0FBQ3pKLFFBQUksUUFBUSxXQUFXO0FBQ3RCLGtCQUFZO0FBQ1osa0JBQVk7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUVBLFNBQU8sS0FBSyxNQUFNLFNBQVM7QUFDNUI7QUFFTyxTQUFTLG1CQUFtQixXQUFzQixXQUFzQixlQUErQztBQUM3SCxRQUFNLFNBQXlCLENBQUM7QUFDaEMsYUFBVyxLQUFLLGVBQWU7QUFDOUIsVUFBTSxPQUFPLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFDckMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLEtBQUssQ0FBQztBQUNiO0FBQUEsSUFDRDtBQUVBLFFBQUksRUFBRSxVQUFVLFFBQVEsS0FBSyxVQUFVLGdCQUFnQixLQUFLLEVBQUUsVUFBVSxRQUFRLEtBQUssVUFBVSxnQkFBZ0IsR0FBRztBQUNqSCxhQUFPLE9BQU8sU0FBUyxDQUFDLElBQUksSUFBSSxhQUFhLEtBQUssVUFBVSxLQUFLLEVBQUUsU0FBUyxHQUFHLEtBQUssVUFBVSxLQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsSUFDaEgsT0FBTztBQUNOLGFBQU8sS0FBSyxDQUFDO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLHFDQUNmLFdBQ0EsV0FDQSxlQUNBLFlBQ0EsUUFBaUIsT0FDQTtBQUNqQixRQUFNLGdCQUFnQixhQUFhLE9BQU8sZUFBZSxVQUFVLE1BQU07QUFFekUsUUFBTSxhQUE2QixDQUFDO0FBRXBDLE1BQUksWUFBWSxJQUFJLFdBQVcsR0FBRyxDQUFDO0FBRW5DLFdBQVMsU0FBUyxNQUFrQixjQUE0QjtBQUMvRCxRQUFJLEtBQUssVUFBVSxVQUFVLFdBQVcsS0FBSyxVQUFVLFVBQVUsU0FBUztBQUN6RTtBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssV0FBVyxXQUFXLEtBQUssT0FBTztBQUM3QyxVQUFNLEtBQUssV0FBVyxXQUFXLEtBQUssT0FBTztBQUM3QyxRQUFJLENBQUMsTUFBTSxDQUFDLElBQUk7QUFDZjtBQUFBLElBQ0Q7QUFDQSxRQUFJLElBQUksSUFBSSxhQUFhLElBQUksRUFBRTtBQUMvQixVQUFNLFlBQVksRUFBRSxVQUFVLFlBQVk7QUFFMUMsUUFBSSxjQUFjLFVBQVUsVUFBVTtBQUN0QyxRQUFJLGNBQWMsVUFBVSxVQUFVO0FBS3RDLFdBQU8sY0FBYyxTQUFTLEdBQUc7QUFDaEMsWUFBTSxPQUFPLGNBQWMsQ0FBQztBQUM1QixZQUFNLGFBQWEsS0FBSyxVQUFVLFdBQVcsRUFBRSxTQUFTLEtBQUssS0FBSyxVQUFVLFdBQVcsRUFBRSxTQUFTO0FBQ2xHLFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUVBLFlBQU0sS0FBSyxXQUFXLFdBQVcsS0FBSyxVQUFVLEtBQUs7QUFDckQsWUFBTSxLQUFLLFdBQVcsV0FBVyxLQUFLLFVBQVUsS0FBSztBQUVyRCxZQUFNLElBQUksSUFBSSxhQUFhLElBQUssRUFBRztBQUNuQyxZQUFNQSxhQUFZLEVBQUUsVUFBVSxJQUFJO0FBRWxDLHFCQUFlQSxXQUFVLFVBQVU7QUFDbkMscUJBQWVBLFdBQVUsVUFBVTtBQUVuQyxVQUFJLEVBQUUsS0FBSyxDQUFDO0FBRVosVUFBSSxFQUFFLFVBQVUsZ0JBQWdCLEtBQUssVUFBVSxjQUFjO0FBRTVELHNCQUFjLE1BQU07QUFBQSxNQUNyQixPQUFPO0FBQ047QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUssU0FBUyxjQUFjLGNBQWMsRUFBRSxVQUFVLFNBQVMsRUFBRSxVQUFVLFVBQVcsY0FBYyxlQUFlLEVBQUUsVUFBVSxTQUFTLEVBQUUsVUFBVSxVQUFVLElBQUksR0FBRztBQUNwSyxpQkFBVyxLQUFLLENBQUM7QUFBQSxJQUNsQjtBQUVBLGdCQUFZLEVBQUUsaUJBQWlCO0FBQUEsRUFDaEM7QUFFQSxTQUFPLGNBQWMsU0FBUyxHQUFHO0FBQ2hDLFVBQU0sT0FBTyxjQUFjLE1BQU07QUFDakMsUUFBSSxLQUFLLFVBQVUsU0FBUztBQUMzQjtBQUFBLElBQ0Q7QUFDQSxhQUFTLEtBQUssVUFBVSxHQUFHLElBQUk7QUFFL0IsYUFBUyxLQUFLLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUk7QUFBQSxFQUNqRDtBQUVBLFFBQU0sU0FBUyxtQkFBbUIsZUFBZSxVQUFVO0FBQzNELFNBQU87QUFDUjtBQUVBLFNBQVMsbUJBQW1CLGdCQUFnQyxnQkFBZ0Q7QUFDM0csUUFBTSxTQUF5QixDQUFDO0FBRWhDLFNBQU8sZUFBZSxTQUFTLEtBQUssZUFBZSxTQUFTLEdBQUc7QUFDOUQsVUFBTSxNQUFNLGVBQWUsQ0FBQztBQUM1QixVQUFNLE1BQU0sZUFBZSxDQUFDO0FBRTVCLFFBQUk7QUFDSixRQUFJLFFBQVEsQ0FBQyxPQUFPLElBQUksVUFBVSxRQUFRLElBQUksVUFBVSxRQUFRO0FBQy9ELGFBQU8sZUFBZSxNQUFNO0FBQUEsSUFDN0IsT0FBTztBQUNOLGFBQU8sZUFBZSxNQUFNO0FBQUEsSUFDN0I7QUFFQSxRQUFJLE9BQU8sU0FBUyxLQUFLLE9BQU8sT0FBTyxTQUFTLENBQUMsRUFBRSxVQUFVLGdCQUFnQixLQUFLLFVBQVUsT0FBTztBQUNsRyxhQUFPLE9BQU8sU0FBUyxDQUFDLElBQUksT0FBTyxPQUFPLFNBQVMsQ0FBQyxFQUFFLEtBQUssSUFBSTtBQUFBLElBQ2hFLE9BQU87QUFDTixhQUFPLEtBQUssSUFBSTtBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVPLFNBQVMseUNBQXlDLFdBQXlCLFlBQTBCLGVBQStDO0FBQzFKLE1BQUksUUFBUTtBQUNaLE1BQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLFVBQVU7QUFDZCxNQUFJO0FBQ0osS0FBRztBQUNGLG1CQUFlO0FBRWYsVUFBTSxTQUF5QjtBQUFBLE1BQzlCLE1BQU0sQ0FBQztBQUFBLElBQ1I7QUFFQSxhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBSXRDLFVBQVNDLG1CQUFULFNBQXlCLFFBQXNCLE9BQThCO0FBQzVFLGNBQU0saUJBQWlCLElBQUksWUFBWSxXQUFXLFVBQVUsY0FBYyxJQUFJLFVBQVUsS0FBSztBQUU3RixjQUFNLGdCQUFnQixVQUFVLFFBQVEsY0FBYztBQUN0RCxjQUFNLHlCQUF5QixjQUFjLFFBQVEsT0FBTyxFQUFFO0FBQzlELFlBQUksdUJBQXVCLFVBQVUsTUFDaEMsT0FBTyxVQUFVLFNBQVMsT0FBTyxVQUFVLFNBQVMsS0FBSyxNQUFNLFVBQVUsU0FBUyxNQUFNLFVBQVUsU0FBUyxJQUFJO0FBQ25ILGlCQUFPO0FBQUEsUUFDUjtBQUVBLGVBQU87QUFBQSxNQUNSO0FBWFMsNEJBQUFBO0FBSFQsWUFBTSxNQUFNLE1BQU0sQ0FBQztBQUNuQixZQUFNLGFBQWEsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQWUzQyxZQUFNLGFBQWFBLGlCQUFnQixZQUFZLEdBQUc7QUFDbEQsVUFBSSxZQUFZO0FBQ2YsdUJBQWU7QUFDZixlQUFPLE9BQU8sU0FBUyxDQUFDLElBQUksT0FBTyxPQUFPLFNBQVMsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLE1BQy9ELE9BQU87QUFDTixlQUFPLEtBQUssR0FBRztBQUFBLE1BQ2hCO0FBQUEsSUFDRDtBQUVBLFlBQVE7QUFBQSxFQUNULFNBQVMsWUFBWSxNQUFNO0FBRTNCLFNBQU87QUFDUjtBQUVPLFNBQVMsNENBQTRDLFdBQW1DLFdBQW1DLGVBQStDO0FBQ2hMLE1BQUksUUFBUTtBQUNaLE1BQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLFVBQVU7QUFDZCxNQUFJO0FBQ0osS0FBRztBQUNGLG1CQUFlO0FBRWYsVUFBTSxTQUF5QjtBQUFBLE1BQzlCLE1BQU0sQ0FBQztBQUFBLElBQ1I7QUFFQSxhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBSXRDLFVBQVNBLG1CQUFULFNBQXlCLFFBQXNCLE9BQThCO0FBQzVFLGNBQU0saUJBQWlCLElBQUksWUFBWSxXQUFXLFVBQVUsY0FBYyxJQUFJLFVBQVUsS0FBSztBQUU3RixjQUFNLHFCQUFxQixVQUFVLGFBQWEsY0FBYztBQUNoRSxZQUFJLHFCQUFxQixLQUFLLGVBQWUsU0FBUyxLQUFLO0FBQzFELGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sZ0JBQWdCLFVBQVUsUUFBUSxjQUFjLEVBQUUsS0FBSztBQUM3RCxZQUFJLGNBQWMsU0FBUyxNQUFNLGNBQWMsTUFBTSxZQUFZLEVBQUUsU0FBUyxHQUFHO0FBQzlFLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sbUJBQW1CLFVBQVUsYUFBYSxPQUFPLFNBQVM7QUFDaEUsY0FBTSxtQkFBbUIsT0FBTyxVQUFVO0FBQzFDLGNBQU0sbUJBQW1CLFVBQVUsYUFBYSxPQUFPLFNBQVM7QUFDaEUsY0FBTSxtQkFBbUIsT0FBTyxVQUFVO0FBRTFDLGNBQU0sa0JBQWtCLFVBQVUsYUFBYSxNQUFNLFNBQVM7QUFDOUQsY0FBTSxrQkFBa0IsTUFBTSxVQUFVO0FBQ3hDLGNBQU0sa0JBQWtCLFVBQVUsYUFBYSxNQUFNLFNBQVM7QUFDOUQsY0FBTSxrQkFBa0IsTUFBTSxVQUFVO0FBSXhDLGNBQU0sTUFBTSxJQUFJLEtBQUs7QUFDckIsaUJBQVMsSUFBSSxHQUFtQjtBQUMvQixpQkFBTyxLQUFLLElBQUksR0FBRyxHQUFHO0FBQUEsUUFDdkI7QUFFQSxZQUFJLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSSxtQkFBbUIsS0FBSyxnQkFBZ0IsR0FBRyxHQUFHLElBQUksS0FBSyxJQUFJLElBQUksbUJBQW1CLEtBQUssZ0JBQWdCLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFDMUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJLGtCQUFrQixLQUFLLGVBQWUsR0FBRyxHQUFHLElBQUksS0FBSyxJQUFJLElBQUksa0JBQWtCLEtBQUssZUFBZSxHQUFHLEdBQUcsR0FBRyxHQUFHLEtBQU0sT0FBTyxRQUFRLE1BQU8sS0FBSztBQUN4SyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQW5DUyw0QkFBQUE7QUFIVCxZQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ25CLFlBQU0sYUFBYSxPQUFPLE9BQU8sU0FBUyxDQUFDO0FBdUMzQyxZQUFNLGFBQWFBLGlCQUFnQixZQUFZLEdBQUc7QUFDbEQsVUFBSSxZQUFZO0FBQ2YsdUJBQWU7QUFDZixlQUFPLE9BQU8sU0FBUyxDQUFDLElBQUksT0FBTyxPQUFPLFNBQVMsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLE1BQy9ELE9BQU87QUFDTixlQUFPLEtBQUssR0FBRztBQUFBLE1BQ2hCO0FBQUEsSUFDRDtBQUVBLFlBQVE7QUFBQSxFQUNULFNBQVMsWUFBWSxNQUFNO0FBRTNCLFFBQU0sV0FBMkIsQ0FBQztBQUdsQyx1QkFBcUIsT0FBTyxDQUFDLE1BQU0sS0FBSyxTQUFTO0FBQ2hELFFBQUksVUFBVTtBQUVkLGFBQVMsb0JBQW9CLE1BQXVCO0FBQ25ELGFBQU8sS0FBSyxTQUFTLEtBQUssS0FBSyxLQUFLLEVBQUUsVUFBVSxLQUFLLElBQUksVUFBVSxTQUFTLElBQUksVUFBVSxTQUFTO0FBQUEsSUFDcEc7QUFFQSxVQUFNLGFBQWEsVUFBVSxrQkFBa0IsSUFBSSxTQUFTO0FBQzVELFVBQU0sU0FBUyxVQUFVLFFBQVEsSUFBSSxZQUFZLFdBQVcsT0FBTyxJQUFJLFVBQVUsS0FBSyxDQUFDO0FBQ3ZGLFFBQUksb0JBQW9CLE1BQU0sR0FBRztBQUNoQyxnQkFBVSxRQUFRLFdBQVcsQ0FBQyxPQUFPLE1BQU07QUFBQSxJQUM1QztBQUNBLFVBQU0sU0FBUyxVQUFVLFFBQVEsSUFBSSxZQUFZLElBQUksVUFBVSxjQUFjLFdBQVcsWUFBWSxDQUFDO0FBQ3JHLFFBQUksb0JBQW9CLE1BQU0sR0FBRztBQUNoQyxnQkFBVSxRQUFRLFNBQVMsT0FBTyxNQUFNO0FBQUEsSUFDekM7QUFFQSxVQUFNLGlCQUFpQixhQUFhO0FBQUEsTUFDbkMsT0FBTyxLQUFLLGlCQUFpQixJQUFJLFdBQVc7QUFBQSxNQUM1QyxPQUFPLEtBQUssVUFBVSxJQUFJLFdBQVc7QUFBQSxJQUN0QztBQUNBLFVBQU0sU0FBUyxRQUFRLFVBQVUsY0FBYztBQUMvQyxRQUFJLFNBQVMsU0FBUyxLQUFLLE9BQU8sVUFBVSxFQUFFLE9BQU8sU0FBUyxTQUFTLFNBQVMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLEdBQUc7QUFDdkcsZUFBUyxTQUFTLFNBQVMsQ0FBQyxJQUFJLFNBQVMsU0FBUyxTQUFTLENBQUMsRUFBRSxLQUFLLE1BQU07QUFBQSxJQUMxRSxPQUFPO0FBQ04sZUFBUyxLQUFLLE1BQU07QUFBQSxJQUNyQjtBQUFBLEVBQ0QsQ0FBQztBQUVELFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiZXF1YWxQYXJ0IiwgInNob3VsZEpvaW5EaWZmcyJdCn0K
