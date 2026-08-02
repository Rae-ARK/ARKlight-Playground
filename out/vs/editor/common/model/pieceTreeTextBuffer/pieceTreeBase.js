import { CharCode } from "../../../../base/common/charCode.js";
import { Position } from "../../core/position.js";
import { Range } from "../../core/range.js";
import { FindMatch } from "../../model.js";
import { NodeColor, SENTINEL, TreeNode, fixInsert, leftest, rbDelete, righttest, updateTreeMetadata } from "./rbTreeBase.js";
import { Searcher, createFindMatch, isValidMatch } from "../textModelSearch.js";
const AverageBufferSize = 65535;
function createUintArray(arr) {
  let r;
  if (arr[arr.length - 1] < 65536) {
    r = new Uint16Array(arr.length);
  } else {
    r = new Uint32Array(arr.length);
  }
  r.set(arr, 0);
  return r;
}
class LineStarts {
  constructor(lineStarts, cr, lf, crlf, isBasicASCII) {
    this.lineStarts = lineStarts;
    this.cr = cr;
    this.lf = lf;
    this.crlf = crlf;
    this.isBasicASCII = isBasicASCII;
  }
}
function createLineStartsFast(str, readonly = true) {
  const r = [0];
  let rLength = 1;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    if (chr === CharCode.CarriageReturn) {
      if (i + 1 < len && str.charCodeAt(i + 1) === CharCode.LineFeed) {
        r[rLength++] = i + 2;
        i++;
      } else {
        r[rLength++] = i + 1;
      }
    } else if (chr === CharCode.LineFeed) {
      r[rLength++] = i + 1;
    }
  }
  if (readonly) {
    return createUintArray(r);
  } else {
    return r;
  }
}
function createLineStarts(r, str) {
  r.length = 0;
  r[0] = 0;
  let rLength = 1;
  let cr = 0, lf = 0, crlf = 0;
  let isBasicASCII = true;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    if (chr === CharCode.CarriageReturn) {
      if (i + 1 < len && str.charCodeAt(i + 1) === CharCode.LineFeed) {
        crlf++;
        r[rLength++] = i + 2;
        i++;
      } else {
        cr++;
        r[rLength++] = i + 1;
      }
    } else if (chr === CharCode.LineFeed) {
      lf++;
      r[rLength++] = i + 1;
    } else {
      if (isBasicASCII) {
        if (chr !== CharCode.Tab && (chr < 32 || chr > 126)) {
          isBasicASCII = false;
        }
      }
    }
  }
  const result = new LineStarts(createUintArray(r), cr, lf, crlf, isBasicASCII);
  r.length = 0;
  return result;
}
class Piece {
  constructor(bufferIndex, start, end, lineFeedCnt, length) {
    this.bufferIndex = bufferIndex;
    this.start = start;
    this.end = end;
    this.lineFeedCnt = lineFeedCnt;
    this.length = length;
  }
}
class StringBuffer {
  constructor(buffer, lineStarts) {
    this.buffer = buffer;
    this.lineStarts = lineStarts;
  }
}
class PieceTreeSnapshot {
  constructor(tree, BOM) {
    this._pieces = [];
    this._tree = tree;
    this._BOM = BOM;
    this._index = 0;
    if (tree.root !== SENTINEL) {
      tree.iterate(tree.root, (node) => {
        if (node !== SENTINEL) {
          this._pieces.push(node.piece);
        }
        return true;
      });
    }
  }
  read() {
    if (this._pieces.length === 0) {
      if (this._index === 0) {
        this._index++;
        return this._BOM;
      } else {
        return null;
      }
    }
    if (this._index > this._pieces.length - 1) {
      return null;
    }
    if (this._index === 0) {
      return this._BOM + this._tree.getPieceContent(this._pieces[this._index++]);
    }
    return this._tree.getPieceContent(this._pieces[this._index++]);
  }
}
class PieceTreeSearchCache {
  constructor(limit) {
    this._limit = limit;
    this._cache = [];
  }
  get(offset) {
    for (let i = this._cache.length - 1; i >= 0; i--) {
      const nodePos = this._cache[i];
      if (nodePos.nodeStartOffset <= offset && nodePos.nodeStartOffset + nodePos.node.piece.length >= offset) {
        return nodePos;
      }
    }
    return null;
  }
  get2(lineNumber) {
    for (let i = this._cache.length - 1; i >= 0; i--) {
      const nodePos = this._cache[i];
      if (nodePos.nodeStartLineNumber && nodePos.nodeStartLineNumber < lineNumber && nodePos.nodeStartLineNumber + nodePos.node.piece.lineFeedCnt >= lineNumber) {
        return nodePos;
      }
    }
    return null;
  }
  set(nodePosition) {
    if (this._cache.length >= this._limit) {
      this._cache.shift();
    }
    this._cache.push(nodePosition);
  }
  validate(offset) {
    let hasInvalidVal = false;
    const tmp = this._cache;
    for (let i = 0; i < tmp.length; i++) {
      const nodePos = tmp[i];
      if (nodePos.node.parent === null || nodePos.nodeStartOffset >= offset) {
        tmp[i] = null;
        hasInvalidVal = true;
        continue;
      }
    }
    if (hasInvalidVal) {
      const newArr = [];
      for (const entry of tmp) {
        if (entry !== null) {
          newArr.push(entry);
        }
      }
      this._cache = newArr;
    }
  }
}
class PieceTreeBase {
  constructor(chunks, eol, eolNormalized) {
    this.create(chunks, eol, eolNormalized);
  }
  create(chunks, eol, eolNormalized) {
    this._buffers = [
      new StringBuffer("", [0])
    ];
    this._lastChangeBufferPos = { line: 0, column: 0 };
    this.root = SENTINEL;
    this._lineCnt = 1;
    this._length = 0;
    this._EOL = eol;
    this._EOLLength = eol.length;
    this._EOLNormalized = eolNormalized;
    let lastNode = null;
    for (let i = 0, len = chunks.length; i < len; i++) {
      if (chunks[i].buffer.length > 0) {
        if (!chunks[i].lineStarts) {
          chunks[i].lineStarts = createLineStartsFast(chunks[i].buffer);
        }
        const piece = new Piece(
          i + 1,
          { line: 0, column: 0 },
          { line: chunks[i].lineStarts.length - 1, column: chunks[i].buffer.length - chunks[i].lineStarts[chunks[i].lineStarts.length - 1] },
          chunks[i].lineStarts.length - 1,
          chunks[i].buffer.length
        );
        this._buffers.push(chunks[i]);
        lastNode = this.rbInsertRight(lastNode, piece);
      }
    }
    this._searchCache = new PieceTreeSearchCache(1);
    this._lastVisitedLine = { lineNumber: 0, value: "" };
    this.computeBufferMetadata();
  }
  normalizeEOL(eol) {
    const averageBufferSize = AverageBufferSize;
    const min = averageBufferSize - Math.floor(averageBufferSize / 3);
    const max = min * 2;
    let tempChunk = "";
    let tempChunkLen = 0;
    const chunks = [];
    this.iterate(this.root, (node) => {
      const str = this.getNodeContent(node);
      const len = str.length;
      if (tempChunkLen <= min || tempChunkLen + len < max) {
        tempChunk += str;
        tempChunkLen += len;
        return true;
      }
      const text = tempChunk.replace(/\r\n|\r|\n/g, eol);
      chunks.push(new StringBuffer(text, createLineStartsFast(text)));
      tempChunk = str;
      tempChunkLen = len;
      return true;
    });
    if (tempChunkLen > 0) {
      const text = tempChunk.replace(/\r\n|\r|\n/g, eol);
      chunks.push(new StringBuffer(text, createLineStartsFast(text)));
    }
    this.create(chunks, eol, true);
  }
  // #region Buffer API
  getEOL() {
    return this._EOL;
  }
  setEOL(newEOL) {
    this._EOL = newEOL;
    this._EOLLength = this._EOL.length;
    this.normalizeEOL(newEOL);
  }
  createSnapshot(BOM) {
    return new PieceTreeSnapshot(this, BOM);
  }
  equal(other) {
    if (this.getLength() !== other.getLength()) {
      return false;
    }
    if (this.getLineCount() !== other.getLineCount()) {
      return false;
    }
    let offset = 0;
    const ret = this.iterate(this.root, (node) => {
      if (node === SENTINEL) {
        return true;
      }
      const str = this.getNodeContent(node);
      const len = str.length;
      const startPosition = other.nodeAt(offset);
      const endPosition = other.nodeAt(offset + len);
      const val = other.getValueInRange2(startPosition, endPosition);
      offset += len;
      return str === val;
    });
    return ret;
  }
  getOffsetAt(lineNumber, column) {
    let leftLen = 0;
    let x = this.root;
    while (x !== SENTINEL) {
      if (x.left !== SENTINEL && x.lf_left + 1 >= lineNumber) {
        x = x.left;
      } else if (x.lf_left + x.piece.lineFeedCnt + 1 >= lineNumber) {
        leftLen += x.size_left;
        const accumualtedValInCurrentIndex = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
        return leftLen += accumualtedValInCurrentIndex + column - 1;
      } else {
        lineNumber -= x.lf_left + x.piece.lineFeedCnt;
        leftLen += x.size_left + x.piece.length;
        x = x.right;
      }
    }
    return leftLen;
  }
  getPositionAt(offset) {
    offset = Math.floor(offset);
    offset = Math.max(0, offset);
    let x = this.root;
    let lfCnt = 0;
    const originalOffset = offset;
    while (x !== SENTINEL) {
      if (x.size_left !== 0 && x.size_left >= offset) {
        x = x.left;
      } else if (x.size_left + x.piece.length >= offset) {
        const out = this.getIndexOf(x, offset - x.size_left);
        lfCnt += x.lf_left + out.index;
        if (out.index === 0) {
          const lineStartOffset = this.getOffsetAt(lfCnt + 1, 1);
          const column = originalOffset - lineStartOffset;
          return new Position(lfCnt + 1, column + 1);
        }
        return new Position(lfCnt + 1, out.remainder + 1);
      } else {
        offset -= x.size_left + x.piece.length;
        lfCnt += x.lf_left + x.piece.lineFeedCnt;
        if (x.right === SENTINEL) {
          const lineStartOffset = this.getOffsetAt(lfCnt + 1, 1);
          const column = originalOffset - offset - lineStartOffset;
          return new Position(lfCnt + 1, column + 1);
        } else {
          x = x.right;
        }
      }
    }
    return new Position(1, 1);
  }
  getValueInRange(range, eol) {
    if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
      return "";
    }
    const startPosition = this.nodeAt2(range.startLineNumber, range.startColumn);
    const endPosition = this.nodeAt2(range.endLineNumber, range.endColumn);
    const value = this.getValueInRange2(startPosition, endPosition);
    if (eol) {
      if (eol !== this._EOL || !this._EOLNormalized) {
        return value.replace(/\r\n|\r|\n/g, eol);
      }
      if (eol === this.getEOL() && this._EOLNormalized) {
        if (eol === "\r\n") {
        }
        return value;
      }
      return value.replace(/\r\n|\r|\n/g, eol);
    }
    return value;
  }
  getValueInRange2(startPosition, endPosition) {
    if (startPosition.node === endPosition.node) {
      const node = startPosition.node;
      const buffer2 = this._buffers[node.piece.bufferIndex].buffer;
      const startOffset2 = this.offsetInBuffer(node.piece.bufferIndex, node.piece.start);
      return buffer2.substring(startOffset2 + startPosition.remainder, startOffset2 + endPosition.remainder);
    }
    let x = startPosition.node;
    const buffer = this._buffers[x.piece.bufferIndex].buffer;
    const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
    let ret = buffer.substring(startOffset + startPosition.remainder, startOffset + x.piece.length);
    x = x.next();
    while (x !== SENTINEL) {
      const buffer2 = this._buffers[x.piece.bufferIndex].buffer;
      const startOffset2 = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
      if (x === endPosition.node) {
        ret += buffer2.substring(startOffset2, startOffset2 + endPosition.remainder);
        break;
      } else {
        ret += buffer2.substr(startOffset2, x.piece.length);
      }
      x = x.next();
    }
    return ret;
  }
  getLinesContent() {
    const lines = [];
    let linesLength = 0;
    let currentLine = "";
    let danglingCR = false;
    this.iterate(this.root, (node) => {
      if (node === SENTINEL) {
        return true;
      }
      const piece = node.piece;
      let pieceLength = piece.length;
      if (pieceLength === 0) {
        return true;
      }
      const buffer = this._buffers[piece.bufferIndex].buffer;
      const lineStarts = this._buffers[piece.bufferIndex].lineStarts;
      const pieceStartLine = piece.start.line;
      const pieceEndLine = piece.end.line;
      let pieceStartOffset = lineStarts[pieceStartLine] + piece.start.column;
      if (danglingCR) {
        if (buffer.charCodeAt(pieceStartOffset) === CharCode.LineFeed) {
          pieceStartOffset++;
          pieceLength--;
        }
        lines[linesLength++] = currentLine;
        currentLine = "";
        danglingCR = false;
        if (pieceLength === 0) {
          return true;
        }
      }
      if (pieceStartLine === pieceEndLine) {
        if (!this._EOLNormalized && buffer.charCodeAt(pieceStartOffset + pieceLength - 1) === CharCode.CarriageReturn) {
          danglingCR = true;
          currentLine += buffer.substr(pieceStartOffset, pieceLength - 1);
        } else {
          currentLine += buffer.substr(pieceStartOffset, pieceLength);
        }
        return true;
      }
      currentLine += this._EOLNormalized ? buffer.substring(pieceStartOffset, Math.max(pieceStartOffset, lineStarts[pieceStartLine + 1] - this._EOLLength)) : buffer.substring(pieceStartOffset, lineStarts[pieceStartLine + 1]).replace(/(\r\n|\r|\n)$/, "");
      lines[linesLength++] = currentLine;
      for (let line = pieceStartLine + 1; line < pieceEndLine; line++) {
        currentLine = this._EOLNormalized ? buffer.substring(lineStarts[line], lineStarts[line + 1] - this._EOLLength) : buffer.substring(lineStarts[line], lineStarts[line + 1]).replace(/(\r\n|\r|\n)$/, "");
        lines[linesLength++] = currentLine;
      }
      if (!this._EOLNormalized && buffer.charCodeAt(lineStarts[pieceEndLine] + piece.end.column - 1) === CharCode.CarriageReturn) {
        danglingCR = true;
        if (piece.end.column === 0) {
          linesLength--;
        } else {
          currentLine = buffer.substr(lineStarts[pieceEndLine], piece.end.column - 1);
        }
      } else {
        currentLine = buffer.substr(lineStarts[pieceEndLine], piece.end.column);
      }
      return true;
    });
    if (danglingCR) {
      lines[linesLength++] = currentLine;
      currentLine = "";
    }
    lines[linesLength++] = currentLine;
    return lines;
  }
  getLength() {
    return this._length;
  }
  getLineCount() {
    return this._lineCnt;
  }
  getLineContent(lineNumber) {
    if (this._lastVisitedLine.lineNumber === lineNumber) {
      return this._lastVisitedLine.value;
    }
    this._lastVisitedLine.lineNumber = lineNumber;
    if (lineNumber === this._lineCnt) {
      this._lastVisitedLine.value = this.getLineRawContent(lineNumber);
    } else if (this._EOLNormalized) {
      this._lastVisitedLine.value = this.getLineRawContent(lineNumber, this._EOLLength);
    } else {
      this._lastVisitedLine.value = this.getLineRawContent(lineNumber).replace(/(\r\n|\r|\n)$/, "");
    }
    return this._lastVisitedLine.value;
  }
  _getCharCode(nodePos) {
    if (nodePos.remainder === nodePos.node.piece.length) {
      const matchingNode = nodePos.node.next();
      if (!matchingNode) {
        return 0;
      }
      const buffer = this._buffers[matchingNode.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(matchingNode.piece.bufferIndex, matchingNode.piece.start);
      return buffer.buffer.charCodeAt(startOffset);
    } else {
      const buffer = this._buffers[nodePos.node.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(nodePos.node.piece.bufferIndex, nodePos.node.piece.start);
      const targetOffset = startOffset + nodePos.remainder;
      return buffer.buffer.charCodeAt(targetOffset);
    }
  }
  getLineCharCode(lineNumber, index) {
    const nodePos = this.nodeAt2(lineNumber, index + 1);
    return this._getCharCode(nodePos);
  }
  getLineLength(lineNumber) {
    if (lineNumber === this.getLineCount()) {
      const startOffset = this.getOffsetAt(lineNumber, 1);
      return this.getLength() - startOffset;
    }
    return this.getOffsetAt(lineNumber + 1, 1) - this.getOffsetAt(lineNumber, 1) - this._EOLLength;
  }
  getCharCode(offset) {
    const nodePos = this.nodeAt(offset);
    return this._getCharCode(nodePos);
  }
  getNearestChunk(offset) {
    const nodePos = this.nodeAt(offset);
    if (nodePos.remainder === nodePos.node.piece.length) {
      const matchingNode = nodePos.node.next();
      if (!matchingNode || matchingNode === SENTINEL) {
        return "";
      }
      const buffer = this._buffers[matchingNode.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(matchingNode.piece.bufferIndex, matchingNode.piece.start);
      return buffer.buffer.substring(startOffset, startOffset + matchingNode.piece.length);
    } else {
      const buffer = this._buffers[nodePos.node.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(nodePos.node.piece.bufferIndex, nodePos.node.piece.start);
      const targetOffset = startOffset + nodePos.remainder;
      const targetEnd = startOffset + nodePos.node.piece.length;
      return buffer.buffer.substring(targetOffset, targetEnd);
    }
  }
  findMatchesInNode(node, searcher, startLineNumber, startColumn, startCursor, endCursor, searchData, captureMatches, limitResultCount, resultLen, result) {
    const buffer = this._buffers[node.piece.bufferIndex];
    const startOffsetInBuffer = this.offsetInBuffer(node.piece.bufferIndex, node.piece.start);
    const start = this.offsetInBuffer(node.piece.bufferIndex, startCursor);
    const end = this.offsetInBuffer(node.piece.bufferIndex, endCursor);
    let m;
    const ret = { line: 0, column: 0 };
    let searchText;
    let offsetInBuffer;
    if (searcher._wordSeparators) {
      searchText = buffer.buffer.substring(start, end);
      offsetInBuffer = (offset) => offset + start;
      searcher.reset(0);
    } else {
      searchText = buffer.buffer;
      offsetInBuffer = (offset) => offset;
      searcher.reset(start);
    }
    do {
      m = searcher.next(searchText);
      if (m) {
        if (offsetInBuffer(m.index) >= end) {
          return resultLen;
        }
        this.positionInBuffer(node, offsetInBuffer(m.index) - startOffsetInBuffer, ret);
        const lineFeedCnt = this.getLineFeedCnt(node.piece.bufferIndex, startCursor, ret);
        const retStartColumn = ret.line === startCursor.line ? ret.column - startCursor.column + startColumn : ret.column + 1;
        const retEndColumn = retStartColumn + m[0].length;
        result[resultLen++] = createFindMatch(new Range(startLineNumber + lineFeedCnt, retStartColumn, startLineNumber + lineFeedCnt, retEndColumn), m, captureMatches);
        if (offsetInBuffer(m.index) + m[0].length >= end) {
          return resultLen;
        }
        if (resultLen >= limitResultCount) {
          return resultLen;
        }
      }
    } while (m);
    return resultLen;
  }
  findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount) {
    const result = [];
    let resultLen = 0;
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    let startPosition = this.nodeAt2(searchRange.startLineNumber, searchRange.startColumn);
    if (startPosition === null) {
      return [];
    }
    const endPosition = this.nodeAt2(searchRange.endLineNumber, searchRange.endColumn);
    if (endPosition === null) {
      return [];
    }
    let start = this.positionInBuffer(startPosition.node, startPosition.remainder);
    const end = this.positionInBuffer(endPosition.node, endPosition.remainder);
    if (startPosition.node === endPosition.node) {
      this.findMatchesInNode(startPosition.node, searcher, searchRange.startLineNumber, searchRange.startColumn, start, end, searchData, captureMatches, limitResultCount, resultLen, result);
      return result;
    }
    let startLineNumber = searchRange.startLineNumber;
    let currentNode = startPosition.node;
    while (currentNode !== endPosition.node) {
      const lineBreakCnt = this.getLineFeedCnt(currentNode.piece.bufferIndex, start, currentNode.piece.end);
      if (lineBreakCnt >= 1) {
        const lineStarts = this._buffers[currentNode.piece.bufferIndex].lineStarts;
        const startOffsetInBuffer = this.offsetInBuffer(currentNode.piece.bufferIndex, currentNode.piece.start);
        const nextLineStartOffset = lineStarts[start.line + lineBreakCnt];
        const startColumn3 = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn : 1;
        resultLen = this.findMatchesInNode(currentNode, searcher, startLineNumber, startColumn3, start, this.positionInBuffer(currentNode, nextLineStartOffset - startOffsetInBuffer), searchData, captureMatches, limitResultCount, resultLen, result);
        if (resultLen >= limitResultCount) {
          return result;
        }
        startLineNumber += lineBreakCnt;
      }
      const startColumn2 = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn - 1 : 0;
      if (startLineNumber === searchRange.endLineNumber) {
        const text = this.getLineContent(startLineNumber).substring(startColumn2, searchRange.endColumn - 1);
        resultLen = this._findMatchesInLine(searchData, searcher, text, searchRange.endLineNumber, startColumn2, resultLen, result, captureMatches, limitResultCount);
        return result;
      }
      resultLen = this._findMatchesInLine(searchData, searcher, this.getLineContent(startLineNumber).substr(startColumn2), startLineNumber, startColumn2, resultLen, result, captureMatches, limitResultCount);
      if (resultLen >= limitResultCount) {
        return result;
      }
      startLineNumber++;
      startPosition = this.nodeAt2(startLineNumber, 1);
      currentNode = startPosition.node;
      start = this.positionInBuffer(startPosition.node, startPosition.remainder);
    }
    if (startLineNumber === searchRange.endLineNumber) {
      const startColumn2 = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn - 1 : 0;
      const text = this.getLineContent(startLineNumber).substring(startColumn2, searchRange.endColumn - 1);
      resultLen = this._findMatchesInLine(searchData, searcher, text, searchRange.endLineNumber, startColumn2, resultLen, result, captureMatches, limitResultCount);
      return result;
    }
    const startColumn = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn : 1;
    resultLen = this.findMatchesInNode(endPosition.node, searcher, startLineNumber, startColumn, start, end, searchData, captureMatches, limitResultCount, resultLen, result);
    return result;
  }
  _findMatchesInLine(searchData, searcher, text, lineNumber, deltaOffset, resultLen, result, captureMatches, limitResultCount) {
    const wordSeparators = searchData.wordSeparators;
    if (!captureMatches && searchData.simpleSearch) {
      const searchString = searchData.simpleSearch;
      const searchStringLen = searchString.length;
      const textLength = text.length;
      let lastMatchIndex = -searchStringLen;
      while ((lastMatchIndex = text.indexOf(searchString, lastMatchIndex + searchStringLen)) !== -1) {
        if (!wordSeparators || isValidMatch(wordSeparators, text, textLength, lastMatchIndex, searchStringLen)) {
          result[resultLen++] = new FindMatch(new Range(lineNumber, lastMatchIndex + 1 + deltaOffset, lineNumber, lastMatchIndex + 1 + searchStringLen + deltaOffset), null);
          if (resultLen >= limitResultCount) {
            return resultLen;
          }
        }
      }
      return resultLen;
    }
    let m;
    searcher.reset(0);
    do {
      m = searcher.next(text);
      if (m) {
        result[resultLen++] = createFindMatch(new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset), m, captureMatches);
        if (resultLen >= limitResultCount) {
          return resultLen;
        }
      }
    } while (m);
    return resultLen;
  }
  // #endregion
  // #region Piece Table
  insert(offset, value, eolNormalized = false) {
    this._EOLNormalized = this._EOLNormalized && eolNormalized;
    this._lastVisitedLine.lineNumber = 0;
    this._lastVisitedLine.value = "";
    if (this.root !== SENTINEL) {
      const { node, remainder, nodeStartOffset } = this.nodeAt(offset);
      const piece = node.piece;
      const bufferIndex = piece.bufferIndex;
      const insertPosInBuffer = this.positionInBuffer(node, remainder);
      if (node.piece.bufferIndex === 0 && piece.end.line === this._lastChangeBufferPos.line && piece.end.column === this._lastChangeBufferPos.column && nodeStartOffset + piece.length === offset && value.length < AverageBufferSize) {
        this.appendToNode(node, value);
        this.computeBufferMetadata();
        return;
      }
      if (nodeStartOffset === offset) {
        this.insertContentToNodeLeft(value, node);
        this._searchCache.validate(offset);
      } else if (nodeStartOffset + node.piece.length > offset) {
        const nodesToDel = [];
        let newRightPiece = new Piece(
          piece.bufferIndex,
          insertPosInBuffer,
          piece.end,
          this.getLineFeedCnt(piece.bufferIndex, insertPosInBuffer, piece.end),
          this.offsetInBuffer(bufferIndex, piece.end) - this.offsetInBuffer(bufferIndex, insertPosInBuffer)
        );
        if (this.shouldCheckCRLF() && this.endWithCR(value)) {
          const headOfRight = this.nodeCharCodeAt(node, remainder);
          if (headOfRight === 10) {
            const newStart = { line: newRightPiece.start.line + 1, column: 0 };
            newRightPiece = new Piece(
              newRightPiece.bufferIndex,
              newStart,
              newRightPiece.end,
              this.getLineFeedCnt(newRightPiece.bufferIndex, newStart, newRightPiece.end),
              newRightPiece.length - 1
            );
            value += "\n";
          }
        }
        if (this.shouldCheckCRLF() && this.startWithLF(value)) {
          const tailOfLeft = this.nodeCharCodeAt(node, remainder - 1);
          if (tailOfLeft === 13) {
            const previousPos = this.positionInBuffer(node, remainder - 1);
            this.deleteNodeTail(node, previousPos);
            value = "\r" + value;
            if (node.piece.length === 0) {
              nodesToDel.push(node);
            }
          } else {
            this.deleteNodeTail(node, insertPosInBuffer);
          }
        } else {
          this.deleteNodeTail(node, insertPosInBuffer);
        }
        const newPieces = this.createNewPieces(value);
        if (newRightPiece.length > 0) {
          this.rbInsertRight(node, newRightPiece);
        }
        let tmpNode = node;
        for (let k = 0; k < newPieces.length; k++) {
          tmpNode = this.rbInsertRight(tmpNode, newPieces[k]);
        }
        this.deleteNodes(nodesToDel);
      } else {
        this.insertContentToNodeRight(value, node);
      }
    } else {
      const pieces = this.createNewPieces(value);
      let node = this.rbInsertLeft(null, pieces[0]);
      for (let k = 1; k < pieces.length; k++) {
        node = this.rbInsertRight(node, pieces[k]);
      }
    }
    this.computeBufferMetadata();
  }
  delete(offset, cnt) {
    this._lastVisitedLine.lineNumber = 0;
    this._lastVisitedLine.value = "";
    if (cnt <= 0 || this.root === SENTINEL) {
      return;
    }
    const startPosition = this.nodeAt(offset);
    const endPosition = this.nodeAt(offset + cnt);
    const startNode = startPosition.node;
    const endNode = endPosition.node;
    if (startNode === endNode) {
      const startSplitPosInBuffer2 = this.positionInBuffer(startNode, startPosition.remainder);
      const endSplitPosInBuffer2 = this.positionInBuffer(startNode, endPosition.remainder);
      if (startPosition.nodeStartOffset === offset) {
        if (cnt === startNode.piece.length) {
          const next = startNode.next();
          rbDelete(this, startNode);
          this.validateCRLFWithPrevNode(next);
          this.computeBufferMetadata();
          return;
        }
        this.deleteNodeHead(startNode, endSplitPosInBuffer2);
        this._searchCache.validate(offset);
        this.validateCRLFWithPrevNode(startNode);
        this.computeBufferMetadata();
        return;
      }
      if (startPosition.nodeStartOffset + startNode.piece.length === offset + cnt) {
        this.deleteNodeTail(startNode, startSplitPosInBuffer2);
        this.validateCRLFWithNextNode(startNode);
        this.computeBufferMetadata();
        return;
      }
      this.shrinkNode(startNode, startSplitPosInBuffer2, endSplitPosInBuffer2);
      this.computeBufferMetadata();
      return;
    }
    const nodesToDel = [];
    const startSplitPosInBuffer = this.positionInBuffer(startNode, startPosition.remainder);
    this.deleteNodeTail(startNode, startSplitPosInBuffer);
    this._searchCache.validate(offset);
    if (startNode.piece.length === 0) {
      nodesToDel.push(startNode);
    }
    const endSplitPosInBuffer = this.positionInBuffer(endNode, endPosition.remainder);
    this.deleteNodeHead(endNode, endSplitPosInBuffer);
    if (endNode.piece.length === 0) {
      nodesToDel.push(endNode);
    }
    const secondNode = startNode.next();
    for (let node = secondNode; node !== SENTINEL && node !== endNode; node = node.next()) {
      nodesToDel.push(node);
    }
    const prev = startNode.piece.length === 0 ? startNode.prev() : startNode;
    this.deleteNodes(nodesToDel);
    this.validateCRLFWithNextNode(prev);
    this.computeBufferMetadata();
  }
  insertContentToNodeLeft(value, node) {
    const nodesToDel = [];
    if (this.shouldCheckCRLF() && this.endWithCR(value) && this.startWithLF(node)) {
      const piece = node.piece;
      const newStart = { line: piece.start.line + 1, column: 0 };
      const nPiece = new Piece(
        piece.bufferIndex,
        newStart,
        piece.end,
        this.getLineFeedCnt(piece.bufferIndex, newStart, piece.end),
        piece.length - 1
      );
      node.piece = nPiece;
      value += "\n";
      updateTreeMetadata(this, node, -1, -1);
      if (node.piece.length === 0) {
        nodesToDel.push(node);
      }
    }
    const newPieces = this.createNewPieces(value);
    let newNode = this.rbInsertLeft(node, newPieces[newPieces.length - 1]);
    for (let k = newPieces.length - 2; k >= 0; k--) {
      newNode = this.rbInsertLeft(newNode, newPieces[k]);
    }
    this.validateCRLFWithPrevNode(newNode);
    this.deleteNodes(nodesToDel);
  }
  insertContentToNodeRight(value, node) {
    if (this.adjustCarriageReturnFromNext(value, node)) {
      value += "\n";
    }
    const newPieces = this.createNewPieces(value);
    const newNode = this.rbInsertRight(node, newPieces[0]);
    let tmpNode = newNode;
    for (let k = 1; k < newPieces.length; k++) {
      tmpNode = this.rbInsertRight(tmpNode, newPieces[k]);
    }
    this.validateCRLFWithPrevNode(newNode);
  }
  positionInBuffer(node, remainder, ret) {
    const piece = node.piece;
    const bufferIndex = node.piece.bufferIndex;
    const lineStarts = this._buffers[bufferIndex].lineStarts;
    const startOffset = lineStarts[piece.start.line] + piece.start.column;
    const offset = startOffset + remainder;
    let low = piece.start.line;
    let high = piece.end.line;
    let mid = 0;
    let midStop = 0;
    let midStart = 0;
    while (low <= high) {
      mid = low + (high - low) / 2 | 0;
      midStart = lineStarts[mid];
      if (mid === high) {
        break;
      }
      midStop = lineStarts[mid + 1];
      if (offset < midStart) {
        high = mid - 1;
      } else if (offset >= midStop) {
        low = mid + 1;
      } else {
        break;
      }
    }
    if (ret) {
      ret.line = mid;
      ret.column = offset - midStart;
      return null;
    }
    return {
      line: mid,
      column: offset - midStart
    };
  }
  getLineFeedCnt(bufferIndex, start, end) {
    if (end.column === 0) {
      return end.line - start.line;
    }
    const lineStarts = this._buffers[bufferIndex].lineStarts;
    if (end.line === lineStarts.length - 1) {
      return end.line - start.line;
    }
    const nextLineStartOffset = lineStarts[end.line + 1];
    const endOffset = lineStarts[end.line] + end.column;
    if (nextLineStartOffset > endOffset + 1) {
      return end.line - start.line;
    }
    const previousCharOffset = endOffset - 1;
    const buffer = this._buffers[bufferIndex].buffer;
    if (buffer.charCodeAt(previousCharOffset) === 13) {
      return end.line - start.line + 1;
    } else {
      return end.line - start.line;
    }
  }
  offsetInBuffer(bufferIndex, cursor) {
    const lineStarts = this._buffers[bufferIndex].lineStarts;
    return lineStarts[cursor.line] + cursor.column;
  }
  deleteNodes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      rbDelete(this, nodes[i]);
    }
  }
  createNewPieces(text) {
    if (text.length > AverageBufferSize) {
      const newPieces = [];
      while (text.length > AverageBufferSize) {
        const lastChar = text.charCodeAt(AverageBufferSize - 1);
        let splitText;
        if (lastChar === CharCode.CarriageReturn || lastChar >= 55296 && lastChar <= 56319) {
          splitText = text.substring(0, AverageBufferSize - 1);
          text = text.substring(AverageBufferSize - 1);
        } else {
          splitText = text.substring(0, AverageBufferSize);
          text = text.substring(AverageBufferSize);
        }
        const lineStarts3 = createLineStartsFast(splitText);
        newPieces.push(new Piece(
          this._buffers.length,
          /* buffer index */
          { line: 0, column: 0 },
          { line: lineStarts3.length - 1, column: splitText.length - lineStarts3[lineStarts3.length - 1] },
          lineStarts3.length - 1,
          splitText.length
        ));
        this._buffers.push(new StringBuffer(splitText, lineStarts3));
      }
      const lineStarts2 = createLineStartsFast(text);
      newPieces.push(new Piece(
        this._buffers.length,
        /* buffer index */
        { line: 0, column: 0 },
        { line: lineStarts2.length - 1, column: text.length - lineStarts2[lineStarts2.length - 1] },
        lineStarts2.length - 1,
        text.length
      ));
      this._buffers.push(new StringBuffer(text, lineStarts2));
      return newPieces;
    }
    let startOffset = this._buffers[0].buffer.length;
    const lineStarts = createLineStartsFast(text, false);
    let start = this._lastChangeBufferPos;
    if (this._buffers[0].lineStarts[this._buffers[0].lineStarts.length - 1] === startOffset && startOffset !== 0 && this.startWithLF(text) && this.endWithCR(this._buffers[0].buffer)) {
      this._lastChangeBufferPos = { line: this._lastChangeBufferPos.line, column: this._lastChangeBufferPos.column + 1 };
      start = this._lastChangeBufferPos;
      for (let i = 0; i < lineStarts.length; i++) {
        lineStarts[i] += startOffset + 1;
      }
      this._buffers[0].lineStarts = this._buffers[0].lineStarts.concat(lineStarts.slice(1));
      this._buffers[0].buffer += "_" + text;
      startOffset += 1;
    } else {
      if (startOffset !== 0) {
        for (let i = 0; i < lineStarts.length; i++) {
          lineStarts[i] += startOffset;
        }
      }
      this._buffers[0].lineStarts = this._buffers[0].lineStarts.concat(lineStarts.slice(1));
      this._buffers[0].buffer += text;
    }
    const endOffset = this._buffers[0].buffer.length;
    const endIndex = this._buffers[0].lineStarts.length - 1;
    const endColumn = endOffset - this._buffers[0].lineStarts[endIndex];
    const endPos = { line: endIndex, column: endColumn };
    const newPiece = new Piece(
      0,
      /** todo@peng */
      start,
      endPos,
      this.getLineFeedCnt(0, start, endPos),
      endOffset - startOffset
    );
    this._lastChangeBufferPos = endPos;
    return [newPiece];
  }
  getLinesRawContent() {
    return this.getContentOfSubTree(this.root);
  }
  getLineRawContent(lineNumber, endOffset = 0) {
    let x = this.root;
    let ret = "";
    const cache = this._searchCache.get2(lineNumber);
    if (cache) {
      x = cache.node;
      const prevAccumulatedValue = this.getAccumulatedValue(x, lineNumber - cache.nodeStartLineNumber - 1);
      const buffer = this._buffers[x.piece.bufferIndex].buffer;
      const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
      if (cache.nodeStartLineNumber + x.piece.lineFeedCnt === lineNumber) {
        ret = buffer.substring(startOffset + prevAccumulatedValue, startOffset + x.piece.length);
      } else {
        const accumulatedValue = this.getAccumulatedValue(x, lineNumber - cache.nodeStartLineNumber);
        return buffer.substring(startOffset + prevAccumulatedValue, startOffset + accumulatedValue - endOffset);
      }
    } else {
      let nodeStartOffset = 0;
      const originalLineNumber = lineNumber;
      while (x !== SENTINEL) {
        if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
          x = x.left;
        } else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
          const prevAccumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
          const accumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 1);
          const buffer = this._buffers[x.piece.bufferIndex].buffer;
          const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
          nodeStartOffset += x.size_left;
          this._searchCache.set({
            node: x,
            nodeStartOffset,
            nodeStartLineNumber: originalLineNumber - (lineNumber - 1 - x.lf_left)
          });
          return buffer.substring(startOffset + prevAccumulatedValue, startOffset + accumulatedValue - endOffset);
        } else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
          const prevAccumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
          const buffer = this._buffers[x.piece.bufferIndex].buffer;
          const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
          ret = buffer.substring(startOffset + prevAccumulatedValue, startOffset + x.piece.length);
          break;
        } else {
          lineNumber -= x.lf_left + x.piece.lineFeedCnt;
          nodeStartOffset += x.size_left + x.piece.length;
          x = x.right;
        }
      }
    }
    x = x.next();
    while (x !== SENTINEL) {
      const buffer = this._buffers[x.piece.bufferIndex].buffer;
      if (x.piece.lineFeedCnt > 0) {
        const accumulatedValue = this.getAccumulatedValue(x, 0);
        const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
        ret += buffer.substring(startOffset, startOffset + accumulatedValue - endOffset);
        return ret;
      } else {
        const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
        ret += buffer.substr(startOffset, x.piece.length);
      }
      x = x.next();
    }
    return ret;
  }
  computeBufferMetadata() {
    let x = this.root;
    let lfCnt = 1;
    let len = 0;
    while (x !== SENTINEL) {
      lfCnt += x.lf_left + x.piece.lineFeedCnt;
      len += x.size_left + x.piece.length;
      x = x.right;
    }
    this._lineCnt = lfCnt;
    this._length = len;
    this._searchCache.validate(this._length);
  }
  // #region node operations
  getIndexOf(node, accumulatedValue) {
    const piece = node.piece;
    const pos = this.positionInBuffer(node, accumulatedValue);
    const lineCnt = pos.line - piece.start.line;
    if (this.offsetInBuffer(piece.bufferIndex, piece.end) - this.offsetInBuffer(piece.bufferIndex, piece.start) === accumulatedValue) {
      const realLineCnt = this.getLineFeedCnt(node.piece.bufferIndex, piece.start, pos);
      if (realLineCnt !== lineCnt) {
        return { index: realLineCnt, remainder: 0 };
      }
    }
    return { index: lineCnt, remainder: pos.column };
  }
  getAccumulatedValue(node, index) {
    if (index < 0) {
      return 0;
    }
    const piece = node.piece;
    const lineStarts = this._buffers[piece.bufferIndex].lineStarts;
    const expectedLineStartIndex = piece.start.line + index + 1;
    if (expectedLineStartIndex > piece.end.line) {
      return lineStarts[piece.end.line] + piece.end.column - lineStarts[piece.start.line] - piece.start.column;
    } else {
      return lineStarts[expectedLineStartIndex] - lineStarts[piece.start.line] - piece.start.column;
    }
  }
  deleteNodeTail(node, pos) {
    const piece = node.piece;
    const originalLFCnt = piece.lineFeedCnt;
    const originalEndOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
    const newEnd = pos;
    const newEndOffset = this.offsetInBuffer(piece.bufferIndex, newEnd);
    const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, newEnd);
    const lf_delta = newLineFeedCnt - originalLFCnt;
    const size_delta = newEndOffset - originalEndOffset;
    const newLength = piece.length + size_delta;
    node.piece = new Piece(
      piece.bufferIndex,
      piece.start,
      newEnd,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, node, size_delta, lf_delta);
  }
  deleteNodeHead(node, pos) {
    const piece = node.piece;
    const originalLFCnt = piece.lineFeedCnt;
    const originalStartOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
    const newStart = pos;
    const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, newStart, piece.end);
    const newStartOffset = this.offsetInBuffer(piece.bufferIndex, newStart);
    const lf_delta = newLineFeedCnt - originalLFCnt;
    const size_delta = originalStartOffset - newStartOffset;
    const newLength = piece.length + size_delta;
    node.piece = new Piece(
      piece.bufferIndex,
      newStart,
      piece.end,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, node, size_delta, lf_delta);
  }
  shrinkNode(node, start, end) {
    const piece = node.piece;
    const originalStartPos = piece.start;
    const originalEndPos = piece.end;
    const oldLength = piece.length;
    const oldLFCnt = piece.lineFeedCnt;
    const newEnd = start;
    const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, newEnd);
    const newLength = this.offsetInBuffer(piece.bufferIndex, start) - this.offsetInBuffer(piece.bufferIndex, originalStartPos);
    node.piece = new Piece(
      piece.bufferIndex,
      piece.start,
      newEnd,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, node, newLength - oldLength, newLineFeedCnt - oldLFCnt);
    const newPiece = new Piece(
      piece.bufferIndex,
      end,
      originalEndPos,
      this.getLineFeedCnt(piece.bufferIndex, end, originalEndPos),
      this.offsetInBuffer(piece.bufferIndex, originalEndPos) - this.offsetInBuffer(piece.bufferIndex, end)
    );
    const newNode = this.rbInsertRight(node, newPiece);
    this.validateCRLFWithPrevNode(newNode);
  }
  appendToNode(node, value) {
    if (this.adjustCarriageReturnFromNext(value, node)) {
      value += "\n";
    }
    const hitCRLF = this.shouldCheckCRLF() && this.startWithLF(value) && this.endWithCR(node);
    const startOffset = this._buffers[0].buffer.length;
    this._buffers[0].buffer += value;
    const lineStarts = createLineStartsFast(value, false);
    for (let i = 0; i < lineStarts.length; i++) {
      lineStarts[i] += startOffset;
    }
    if (hitCRLF) {
      const prevStartOffset = this._buffers[0].lineStarts[this._buffers[0].lineStarts.length - 2];
      this._buffers[0].lineStarts.pop();
      this._lastChangeBufferPos = { line: this._lastChangeBufferPos.line - 1, column: startOffset - prevStartOffset };
    }
    this._buffers[0].lineStarts = this._buffers[0].lineStarts.concat(lineStarts.slice(1));
    const endIndex = this._buffers[0].lineStarts.length - 1;
    const endColumn = this._buffers[0].buffer.length - this._buffers[0].lineStarts[endIndex];
    const newEnd = { line: endIndex, column: endColumn };
    const newLength = node.piece.length + value.length;
    const oldLineFeedCnt = node.piece.lineFeedCnt;
    const newLineFeedCnt = this.getLineFeedCnt(0, node.piece.start, newEnd);
    const lf_delta = newLineFeedCnt - oldLineFeedCnt;
    node.piece = new Piece(
      node.piece.bufferIndex,
      node.piece.start,
      newEnd,
      newLineFeedCnt,
      newLength
    );
    this._lastChangeBufferPos = newEnd;
    updateTreeMetadata(this, node, value.length, lf_delta);
  }
  nodeAt(offset) {
    let x = this.root;
    const cache = this._searchCache.get(offset);
    if (cache) {
      return {
        node: cache.node,
        nodeStartOffset: cache.nodeStartOffset,
        remainder: offset - cache.nodeStartOffset
      };
    }
    let nodeStartOffset = 0;
    while (x !== SENTINEL) {
      if (x.size_left > offset) {
        x = x.left;
      } else if (x.size_left + x.piece.length >= offset) {
        nodeStartOffset += x.size_left;
        const ret = {
          node: x,
          remainder: offset - x.size_left,
          nodeStartOffset
        };
        this._searchCache.set(ret);
        return ret;
      } else {
        offset -= x.size_left + x.piece.length;
        nodeStartOffset += x.size_left + x.piece.length;
        x = x.right;
      }
    }
    return null;
  }
  nodeAt2(lineNumber, column) {
    let x = this.root;
    let nodeStartOffset = 0;
    while (x !== SENTINEL) {
      if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
        x = x.left;
      } else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
        const prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
        const accumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 1);
        nodeStartOffset += x.size_left;
        return {
          node: x,
          remainder: Math.min(prevAccumualtedValue + column - 1, accumulatedValue),
          nodeStartOffset
        };
      } else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
        const prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
        if (prevAccumualtedValue + column - 1 <= x.piece.length) {
          return {
            node: x,
            remainder: prevAccumualtedValue + column - 1,
            nodeStartOffset
          };
        } else {
          column -= x.piece.length - prevAccumualtedValue;
          break;
        }
      } else {
        lineNumber -= x.lf_left + x.piece.lineFeedCnt;
        nodeStartOffset += x.size_left + x.piece.length;
        x = x.right;
      }
    }
    x = x.next();
    while (x !== SENTINEL) {
      if (x.piece.lineFeedCnt > 0) {
        const accumulatedValue = this.getAccumulatedValue(x, 0);
        const nodeStartOffset2 = this.offsetOfNode(x);
        return {
          node: x,
          remainder: Math.min(column - 1, accumulatedValue),
          nodeStartOffset: nodeStartOffset2
        };
      } else {
        if (x.piece.length >= column - 1) {
          const nodeStartOffset2 = this.offsetOfNode(x);
          return {
            node: x,
            remainder: column - 1,
            nodeStartOffset: nodeStartOffset2
          };
        } else {
          column -= x.piece.length;
        }
      }
      x = x.next();
    }
    return null;
  }
  nodeCharCodeAt(node, offset) {
    if (node.piece.lineFeedCnt < 1) {
      return -1;
    }
    const buffer = this._buffers[node.piece.bufferIndex];
    const newOffset = this.offsetInBuffer(node.piece.bufferIndex, node.piece.start) + offset;
    return buffer.buffer.charCodeAt(newOffset);
  }
  offsetOfNode(node) {
    if (!node) {
      return 0;
    }
    let pos = node.size_left;
    while (node !== this.root) {
      if (node.parent.right === node) {
        pos += node.parent.size_left + node.parent.piece.length;
      }
      node = node.parent;
    }
    return pos;
  }
  // #endregion
  // #region CRLF
  shouldCheckCRLF() {
    return !(this._EOLNormalized && this._EOL === "\n");
  }
  startWithLF(val) {
    if (typeof val === "string") {
      return val.charCodeAt(0) === 10;
    }
    if (val === SENTINEL || val.piece.lineFeedCnt === 0) {
      return false;
    }
    const piece = val.piece;
    const lineStarts = this._buffers[piece.bufferIndex].lineStarts;
    const line = piece.start.line;
    const startOffset = lineStarts[line] + piece.start.column;
    if (line === lineStarts.length - 1) {
      return false;
    }
    const nextLineOffset = lineStarts[line + 1];
    if (nextLineOffset > startOffset + 1) {
      return false;
    }
    return this._buffers[piece.bufferIndex].buffer.charCodeAt(startOffset) === 10;
  }
  endWithCR(val) {
    if (typeof val === "string") {
      return val.charCodeAt(val.length - 1) === 13;
    }
    if (val === SENTINEL || val.piece.lineFeedCnt === 0) {
      return false;
    }
    return this.nodeCharCodeAt(val, val.piece.length - 1) === 13;
  }
  validateCRLFWithPrevNode(nextNode) {
    if (this.shouldCheckCRLF() && this.startWithLF(nextNode)) {
      const node = nextNode.prev();
      if (this.endWithCR(node)) {
        this.fixCRLF(node, nextNode);
      }
    }
  }
  validateCRLFWithNextNode(node) {
    if (this.shouldCheckCRLF() && this.endWithCR(node)) {
      const nextNode = node.next();
      if (this.startWithLF(nextNode)) {
        this.fixCRLF(node, nextNode);
      }
    }
  }
  fixCRLF(prev, next) {
    const nodesToDel = [];
    const lineStarts = this._buffers[prev.piece.bufferIndex].lineStarts;
    let newEnd;
    if (prev.piece.end.column === 0) {
      newEnd = { line: prev.piece.end.line - 1, column: lineStarts[prev.piece.end.line] - lineStarts[prev.piece.end.line - 1] - 1 };
    } else {
      newEnd = { line: prev.piece.end.line, column: prev.piece.end.column - 1 };
    }
    const prevNewLength = prev.piece.length - 1;
    const prevNewLFCnt = prev.piece.lineFeedCnt - 1;
    prev.piece = new Piece(
      prev.piece.bufferIndex,
      prev.piece.start,
      newEnd,
      prevNewLFCnt,
      prevNewLength
    );
    updateTreeMetadata(this, prev, -1, -1);
    if (prev.piece.length === 0) {
      nodesToDel.push(prev);
    }
    const newStart = { line: next.piece.start.line + 1, column: 0 };
    const newLength = next.piece.length - 1;
    const newLineFeedCnt = this.getLineFeedCnt(next.piece.bufferIndex, newStart, next.piece.end);
    next.piece = new Piece(
      next.piece.bufferIndex,
      newStart,
      next.piece.end,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, next, -1, -1);
    if (next.piece.length === 0) {
      nodesToDel.push(next);
    }
    const pieces = this.createNewPieces("\r\n");
    this.rbInsertRight(prev, pieces[0]);
    for (let i = 0; i < nodesToDel.length; i++) {
      rbDelete(this, nodesToDel[i]);
    }
  }
  adjustCarriageReturnFromNext(value, node) {
    if (this.shouldCheckCRLF() && this.endWithCR(value)) {
      const nextNode = node.next();
      if (this.startWithLF(nextNode)) {
        value += "\n";
        if (nextNode.piece.length === 1) {
          rbDelete(this, nextNode);
        } else {
          const piece = nextNode.piece;
          const newStart = { line: piece.start.line + 1, column: 0 };
          const newLength = piece.length - 1;
          const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, newStart, piece.end);
          nextNode.piece = new Piece(
            piece.bufferIndex,
            newStart,
            piece.end,
            newLineFeedCnt,
            newLength
          );
          updateTreeMetadata(this, nextNode, -1, -1);
        }
        return true;
      }
    }
    return false;
  }
  // #endregion
  // #endregion
  // #region Tree operations
  iterate(node, callback) {
    if (node === SENTINEL) {
      return callback(SENTINEL);
    }
    const leftRet = this.iterate(node.left, callback);
    if (!leftRet) {
      return leftRet;
    }
    return callback(node) && this.iterate(node.right, callback);
  }
  getNodeContent(node) {
    if (node === SENTINEL) {
      return "";
    }
    const buffer = this._buffers[node.piece.bufferIndex];
    const piece = node.piece;
    const startOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
    const endOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
    const currentContent = buffer.buffer.substring(startOffset, endOffset);
    return currentContent;
  }
  getPieceContent(piece) {
    const buffer = this._buffers[piece.bufferIndex];
    const startOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
    const endOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
    const currentContent = buffer.buffer.substring(startOffset, endOffset);
    return currentContent;
  }
  /**
   *      node              node
   *     /  \              /  \
   *    a   b    <----   a    b
   *                         /
   *                        z
   */
  rbInsertRight(node, p) {
    const z = new TreeNode(p, NodeColor.Red);
    z.left = SENTINEL;
    z.right = SENTINEL;
    z.parent = SENTINEL;
    z.size_left = 0;
    z.lf_left = 0;
    const x = this.root;
    if (x === SENTINEL) {
      this.root = z;
      z.color = NodeColor.Black;
    } else if (node.right === SENTINEL) {
      node.right = z;
      z.parent = node;
    } else {
      const nextNode = leftest(node.right);
      nextNode.left = z;
      z.parent = nextNode;
    }
    fixInsert(this, z);
    return z;
  }
  /**
   *      node              node
   *     /  \              /  \
   *    a   b     ---->   a    b
   *                       \
   *                        z
   */
  rbInsertLeft(node, p) {
    const z = new TreeNode(p, NodeColor.Red);
    z.left = SENTINEL;
    z.right = SENTINEL;
    z.parent = SENTINEL;
    z.size_left = 0;
    z.lf_left = 0;
    if (this.root === SENTINEL) {
      this.root = z;
      z.color = NodeColor.Black;
    } else if (node.left === SENTINEL) {
      node.left = z;
      z.parent = node;
    } else {
      const prevNode = righttest(node.left);
      prevNode.right = z;
      z.parent = prevNode;
    }
    fixInsert(this, z);
    return z;
  }
  getContentOfSubTree(node) {
    let str = "";
    this.iterate(node, (node2) => {
      str += this.getNodeContent(node2);
      return true;
    });
    return str;
  }
  // #endregion
}
export {
  Piece,
  PieceTreeBase,
  StringBuffer,
  createLineStarts,
  createLineStartsFast
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvcGllY2VUcmVlVGV4dEJ1ZmZlci9waWVjZVRyZWVCYXNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCwgSVRleHRTbmFwc2hvdCwgU2VhcmNoRGF0YSB9IGZyb20gJy4uLy4uL21vZGVsLmpzJztcbmltcG9ydCB7IE5vZGVDb2xvciwgU0VOVElORUwsIFRyZWVOb2RlLCBmaXhJbnNlcnQsIGxlZnRlc3QsIHJiRGVsZXRlLCByaWdodHRlc3QsIHVwZGF0ZVRyZWVNZXRhZGF0YSB9IGZyb20gJy4vcmJUcmVlQmFzZS5qcyc7XG5pbXBvcnQgeyBTZWFyY2hlciwgY3JlYXRlRmluZE1hdGNoLCBpc1ZhbGlkTWF0Y2ggfSBmcm9tICcuLi90ZXh0TW9kZWxTZWFyY2guanMnO1xuXG4vLyBjb25zdCBsZlJlZ2V4ID0gbmV3IFJlZ0V4cCgvXFxyXFxufFxccnxcXG4vZyk7XG5jb25zdCBBdmVyYWdlQnVmZmVyU2l6ZSA9IDY1NTM1O1xuXG5mdW5jdGlvbiBjcmVhdGVVaW50QXJyYXkoYXJyOiBudW1iZXJbXSk6IFVpbnQzMkFycmF5IHwgVWludDE2QXJyYXkge1xuXHRsZXQgcjtcblx0aWYgKGFyclthcnIubGVuZ3RoIC0gMV0gPCA2NTUzNikge1xuXHRcdHIgPSBuZXcgVWludDE2QXJyYXkoYXJyLmxlbmd0aCk7XG5cdH0gZWxzZSB7XG5cdFx0ciA9IG5ldyBVaW50MzJBcnJheShhcnIubGVuZ3RoKTtcblx0fVxuXHRyLnNldChhcnIsIDApO1xuXHRyZXR1cm4gcjtcbn1cblxuY2xhc3MgTGluZVN0YXJ0cyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lU3RhcnRzOiBVaW50MzJBcnJheSB8IFVpbnQxNkFycmF5IHwgbnVtYmVyW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IGNyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxmOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNybGY6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaXNCYXNpY0FTQ0lJOiBib29sZWFuXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMaW5lU3RhcnRzRmFzdChzdHI6IHN0cmluZywgcmVhZG9ubHk6IGJvb2xlYW4gPSB0cnVlKTogVWludDMyQXJyYXkgfCBVaW50MTZBcnJheSB8IG51bWJlcltdIHtcblx0Y29uc3QgcjogbnVtYmVyW10gPSBbMF07XG5cdGxldCByTGVuZ3RoID0gMTtcblxuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gc3RyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgY2hyID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cblx0XHRpZiAoY2hyID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybikge1xuXHRcdFx0aWYgKGkgKyAxIDwgbGVuICYmIHN0ci5jaGFyQ29kZUF0KGkgKyAxKSA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRcdFx0Ly8gXFxyXFxuLi4uIGNhc2Vcblx0XHRcdFx0cltyTGVuZ3RoKytdID0gaSArIDI7XG5cdFx0XHRcdGkrKzsgLy8gc2tpcCBcXG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFxcci4uLiBjYXNlXG5cdFx0XHRcdHJbckxlbmd0aCsrXSA9IGkgKyAxO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY2hyID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0cltyTGVuZ3RoKytdID0gaSArIDE7XG5cdFx0fVxuXHR9XG5cdGlmIChyZWFkb25seSkge1xuXHRcdHJldHVybiBjcmVhdGVVaW50QXJyYXkocik7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHI7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpbmVTdGFydHMocjogbnVtYmVyW10sIHN0cjogc3RyaW5nKTogTGluZVN0YXJ0cyB7XG5cdHIubGVuZ3RoID0gMDtcblx0clswXSA9IDA7XG5cdGxldCByTGVuZ3RoID0gMTtcblx0bGV0IGNyID0gMCwgbGYgPSAwLCBjcmxmID0gMDtcblx0bGV0IGlzQmFzaWNBU0NJSSA9IHRydWU7XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzdHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBjaHIgPSBzdHIuY2hhckNvZGVBdChpKTtcblxuXHRcdGlmIChjaHIgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuKSB7XG5cdFx0XHRpZiAoaSArIDEgPCBsZW4gJiYgc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0XHQvLyBcXHJcXG4uLi4gY2FzZVxuXHRcdFx0XHRjcmxmKys7XG5cdFx0XHRcdHJbckxlbmd0aCsrXSA9IGkgKyAyO1xuXHRcdFx0XHRpKys7IC8vIHNraXAgXFxuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjcisrO1xuXHRcdFx0XHQvLyBcXHIuLi4gY2FzZVxuXHRcdFx0XHRyW3JMZW5ndGgrK10gPSBpICsgMTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGNociA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRcdGxmKys7XG5cdFx0XHRyW3JMZW5ndGgrK10gPSBpICsgMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGlzQmFzaWNBU0NJSSkge1xuXHRcdFx0XHRpZiAoY2hyICE9PSBDaGFyQ29kZS5UYWIgJiYgKGNociA8IDMyIHx8IGNociA+IDEyNikpIHtcblx0XHRcdFx0XHRpc0Jhc2ljQVNDSUkgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRjb25zdCByZXN1bHQgPSBuZXcgTGluZVN0YXJ0cyhjcmVhdGVVaW50QXJyYXkociksIGNyLCBsZiwgY3JsZiwgaXNCYXNpY0FTQ0lJKTtcblx0ci5sZW5ndGggPSAwO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmludGVyZmFjZSBOb2RlUG9zaXRpb24ge1xuXHQvKipcblx0ICogUGllY2UgSW5kZXhcblx0ICovXG5cdG5vZGU6IFRyZWVOb2RlO1xuXHQvKipcblx0ICogcmVtYWluZGVyIGluIGN1cnJlbnQgcGllY2UuXG5cdCovXG5cdHJlbWFpbmRlcjogbnVtYmVyO1xuXHQvKipcblx0ICogbm9kZSBzdGFydCBvZmZzZXQgaW4gZG9jdW1lbnQuXG5cdCAqL1xuXHRub2RlU3RhcnRPZmZzZXQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEJ1ZmZlckN1cnNvciB7XG5cdC8qKlxuXHQgKiBMaW5lIG51bWJlciBpbiBjdXJyZW50IGJ1ZmZlclxuXHQgKi9cblx0bGluZTogbnVtYmVyO1xuXHQvKipcblx0ICogQ29sdW1uIG51bWJlciBpbiBjdXJyZW50IGJ1ZmZlclxuXHQgKi9cblx0Y29sdW1uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBQaWVjZSB7XG5cdHJlYWRvbmx5IGJ1ZmZlckluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0YXJ0OiBCdWZmZXJDdXJzb3I7XG5cdHJlYWRvbmx5IGVuZDogQnVmZmVyQ3Vyc29yO1xuXHRyZWFkb25seSBsZW5ndGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbGluZUZlZWRDbnQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihidWZmZXJJbmRleDogbnVtYmVyLCBzdGFydDogQnVmZmVyQ3Vyc29yLCBlbmQ6IEJ1ZmZlckN1cnNvciwgbGluZUZlZWRDbnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpIHtcblx0XHR0aGlzLmJ1ZmZlckluZGV4ID0gYnVmZmVySW5kZXg7XG5cdFx0dGhpcy5zdGFydCA9IHN0YXJ0O1xuXHRcdHRoaXMuZW5kID0gZW5kO1xuXHRcdHRoaXMubGluZUZlZWRDbnQgPSBsaW5lRmVlZENudDtcblx0XHR0aGlzLmxlbmd0aCA9IGxlbmd0aDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RyaW5nQnVmZmVyIHtcblx0YnVmZmVyOiBzdHJpbmc7XG5cdGxpbmVTdGFydHM6IFVpbnQzMkFycmF5IHwgVWludDE2QXJyYXkgfCBudW1iZXJbXTtcblxuXHRjb25zdHJ1Y3RvcihidWZmZXI6IHN0cmluZywgbGluZVN0YXJ0czogVWludDMyQXJyYXkgfCBVaW50MTZBcnJheSB8IG51bWJlcltdKSB7XG5cdFx0dGhpcy5idWZmZXIgPSBidWZmZXI7XG5cdFx0dGhpcy5saW5lU3RhcnRzID0gbGluZVN0YXJ0cztcblx0fVxufVxuXG4vKipcbiAqIFJlYWRvbmx5IHNuYXBzaG90IGZvciBwaWVjZSB0cmVlLlxuICogSW4gYSByZWFsIG11bHRpcGxlIHRocmVhZCBlbnZpcm9ubWVudCwgdG8gbWFrZSBzbmFwc2hvdCByZWFkaW5nIGFsd2F5cyB3b3JrIGNvcnJlY3RseSwgd2UgbmVlZCB0b1xuICogMS4gTWFrZSBUcmVlTm9kZS5waWVjZSBpbW11dGFibGUsIHRoZW4gcmVhZGluZyBhbmQgd3JpdGluZyBjYW4gcnVuIGluIHBhcmFsbGVsLlxuICogMi4gVHJlZU5vZGUvQnVmZmVycyBub3JtYWxpemF0aW9uIHNob3VsZCBub3QgaGFwcGVuIGR1cmluZyBzbmFwc2hvdCByZWFkaW5nLlxuICovXG5jbGFzcyBQaWVjZVRyZWVTbmFwc2hvdCBpbXBsZW1lbnRzIElUZXh0U25hcHNob3Qge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waWVjZXM6IFBpZWNlW107XG5cdHByaXZhdGUgX2luZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWU6IFBpZWNlVHJlZUJhc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX0JPTTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHRyZWU6IFBpZWNlVHJlZUJhc2UsIEJPTTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fcGllY2VzID0gW107XG5cdFx0dGhpcy5fdHJlZSA9IHRyZWU7XG5cdFx0dGhpcy5fQk9NID0gQk9NO1xuXHRcdHRoaXMuX2luZGV4ID0gMDtcblx0XHRpZiAodHJlZS5yb290ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0dHJlZS5pdGVyYXRlKHRyZWUucm9vdCwgbm9kZSA9PiB7XG5cdFx0XHRcdGlmIChub2RlICE9PSBTRU5USU5FTCkge1xuXHRcdFx0XHRcdHRoaXMuX3BpZWNlcy5wdXNoKG5vZGUucGllY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cmVhZCgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fcGllY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX2luZGV4ID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2luZGV4Kys7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9CT007XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5faW5kZXggPiB0aGlzLl9waWVjZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2luZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fQk9NICsgdGhpcy5fdHJlZS5nZXRQaWVjZUNvbnRlbnQodGhpcy5fcGllY2VzW3RoaXMuX2luZGV4KytdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0UGllY2VDb250ZW50KHRoaXMuX3BpZWNlc1t0aGlzLl9pbmRleCsrXSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIENhY2hlRW50cnkge1xuXHRub2RlOiBUcmVlTm9kZTtcblx0bm9kZVN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdG5vZGVTdGFydExpbmVOdW1iZXI/OiBudW1iZXI7XG59XG5cbmNsYXNzIFBpZWNlVHJlZVNlYXJjaENhY2hlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbGltaXQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfY2FjaGU6IENhY2hlRW50cnlbXTtcblxuXHRjb25zdHJ1Y3RvcihsaW1pdDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbGltaXQgPSBsaW1pdDtcblx0XHR0aGlzLl9jYWNoZSA9IFtdO1xuXHR9XG5cblx0cHVibGljIGdldChvZmZzZXQ6IG51bWJlcik6IENhY2hlRW50cnkgfCBudWxsIHtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fY2FjaGUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG5vZGVQb3MgPSB0aGlzLl9jYWNoZVtpXTtcblx0XHRcdGlmIChub2RlUG9zLm5vZGVTdGFydE9mZnNldCA8PSBvZmZzZXQgJiYgbm9kZVBvcy5ub2RlU3RhcnRPZmZzZXQgKyBub2RlUG9zLm5vZGUucGllY2UubGVuZ3RoID49IG9mZnNldCkge1xuXHRcdFx0XHRyZXR1cm4gbm9kZVBvcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0MihsaW5lTnVtYmVyOiBudW1iZXIpOiB7IG5vZGU6IFRyZWVOb2RlOyBub2RlU3RhcnRPZmZzZXQ6IG51bWJlcjsgbm9kZVN0YXJ0TGluZU51bWJlcjogbnVtYmVyIH0gfCBudWxsIHtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fY2FjaGUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG5vZGVQb3MgPSB0aGlzLl9jYWNoZVtpXTtcblx0XHRcdGlmIChub2RlUG9zLm5vZGVTdGFydExpbmVOdW1iZXIgJiYgbm9kZVBvcy5ub2RlU3RhcnRMaW5lTnVtYmVyIDwgbGluZU51bWJlciAmJiBub2RlUG9zLm5vZGVTdGFydExpbmVOdW1iZXIgKyBub2RlUG9zLm5vZGUucGllY2UubGluZUZlZWRDbnQgPj0gbGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gPHsgbm9kZTogVHJlZU5vZGU7IG5vZGVTdGFydE9mZnNldDogbnVtYmVyOyBub2RlU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIgfT5ub2RlUG9zO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBzZXQobm9kZVBvc2l0aW9uOiBDYWNoZUVudHJ5KSB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlLmxlbmd0aCA+PSB0aGlzLl9saW1pdCkge1xuXHRcdFx0dGhpcy5fY2FjaGUuc2hpZnQoKTtcblx0XHR9XG5cdFx0dGhpcy5fY2FjaGUucHVzaChub2RlUG9zaXRpb24pO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKG9mZnNldDogbnVtYmVyKSB7XG5cdFx0bGV0IGhhc0ludmFsaWRWYWwgPSBmYWxzZTtcblx0XHRjb25zdCB0bXA6IEFycmF5PENhY2hlRW50cnkgfCBudWxsPiA9IHRoaXMuX2NhY2hlO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG1wLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBub2RlUG9zID0gdG1wW2ldITtcblx0XHRcdGlmIChub2RlUG9zLm5vZGUucGFyZW50ID09PSBudWxsIHx8IG5vZGVQb3Mubm9kZVN0YXJ0T2Zmc2V0ID49IG9mZnNldCkge1xuXHRcdFx0XHR0bXBbaV0gPSBudWxsO1xuXHRcdFx0XHRoYXNJbnZhbGlkVmFsID0gdHJ1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGhhc0ludmFsaWRWYWwpIHtcblx0XHRcdGNvbnN0IG5ld0FycjogQ2FjaGVFbnRyeVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRtcCkge1xuXHRcdFx0XHRpZiAoZW50cnkgIT09IG51bGwpIHtcblx0XHRcdFx0XHRuZXdBcnIucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY2FjaGUgPSBuZXdBcnI7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQaWVjZVRyZWVCYXNlIHtcblx0cm9vdCE6IFRyZWVOb2RlO1xuXHRwcm90ZWN0ZWQgX2J1ZmZlcnMhOiBTdHJpbmdCdWZmZXJbXTsgLy8gMCBpcyBjaGFuZ2UgYnVmZmVyLCBvdGhlcnMgYXJlIHJlYWRvbmx5IG9yaWdpbmFsIGJ1ZmZlci5cblx0cHJvdGVjdGVkIF9saW5lQ250ITogbnVtYmVyO1xuXHRwcm90ZWN0ZWQgX2xlbmd0aCE6IG51bWJlcjtcblx0cHJvdGVjdGVkIF9FT0whOiAnXFxyXFxuJyB8ICdcXG4nO1xuXHRwcm90ZWN0ZWQgX0VPTExlbmd0aCE6IG51bWJlcjtcblx0cHJvdGVjdGVkIF9FT0xOb3JtYWxpemVkITogYm9vbGVhbjtcblx0cHJpdmF0ZSBfbGFzdENoYW5nZUJ1ZmZlclBvcyE6IEJ1ZmZlckN1cnNvcjtcblx0cHJpdmF0ZSBfc2VhcmNoQ2FjaGUhOiBQaWVjZVRyZWVTZWFyY2hDYWNoZTtcblx0cHJpdmF0ZSBfbGFzdFZpc2l0ZWRMaW5lITogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHZhbHVlOiBzdHJpbmcgfTtcblxuXHRjb25zdHJ1Y3RvcihjaHVua3M6IFN0cmluZ0J1ZmZlcltdLCBlb2w6ICdcXHJcXG4nIHwgJ1xcbicsIGVvbE5vcm1hbGl6ZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmNyZWF0ZShjaHVua3MsIGVvbCwgZW9sTm9ybWFsaXplZCk7XG5cdH1cblxuXHRjcmVhdGUoY2h1bmtzOiBTdHJpbmdCdWZmZXJbXSwgZW9sOiAnXFxyXFxuJyB8ICdcXG4nLCBlb2xOb3JtYWxpemVkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fYnVmZmVycyA9IFtcblx0XHRcdG5ldyBTdHJpbmdCdWZmZXIoJycsIFswXSlcblx0XHRdO1xuXHRcdHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3MgPSB7IGxpbmU6IDAsIGNvbHVtbjogMCB9O1xuXHRcdHRoaXMucm9vdCA9IFNFTlRJTkVMO1xuXHRcdHRoaXMuX2xpbmVDbnQgPSAxO1xuXHRcdHRoaXMuX2xlbmd0aCA9IDA7XG5cdFx0dGhpcy5fRU9MID0gZW9sO1xuXHRcdHRoaXMuX0VPTExlbmd0aCA9IGVvbC5sZW5ndGg7XG5cdFx0dGhpcy5fRU9MTm9ybWFsaXplZCA9IGVvbE5vcm1hbGl6ZWQ7XG5cblx0XHRsZXQgbGFzdE5vZGU6IFRyZWVOb2RlIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGNodW5rcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGNodW5rc1tpXS5idWZmZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoIWNodW5rc1tpXS5saW5lU3RhcnRzKSB7XG5cdFx0XHRcdFx0Y2h1bmtzW2ldLmxpbmVTdGFydHMgPSBjcmVhdGVMaW5lU3RhcnRzRmFzdChjaHVua3NbaV0uYnVmZmVyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0XHRcdGkgKyAxLFxuXHRcdFx0XHRcdHsgbGluZTogMCwgY29sdW1uOiAwIH0sXG5cdFx0XHRcdFx0eyBsaW5lOiBjaHVua3NbaV0ubGluZVN0YXJ0cy5sZW5ndGggLSAxLCBjb2x1bW46IGNodW5rc1tpXS5idWZmZXIubGVuZ3RoIC0gY2h1bmtzW2ldLmxpbmVTdGFydHNbY2h1bmtzW2ldLmxpbmVTdGFydHMubGVuZ3RoIC0gMV0gfSxcblx0XHRcdFx0XHRjaHVua3NbaV0ubGluZVN0YXJ0cy5sZW5ndGggLSAxLFxuXHRcdFx0XHRcdGNodW5rc1tpXS5idWZmZXIubGVuZ3RoXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlcnMucHVzaChjaHVua3NbaV0pO1xuXHRcdFx0XHRsYXN0Tm9kZSA9IHRoaXMucmJJbnNlcnRSaWdodChsYXN0Tm9kZSwgcGllY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NlYXJjaENhY2hlID0gbmV3IFBpZWNlVHJlZVNlYXJjaENhY2hlKDEpO1xuXHRcdHRoaXMuX2xhc3RWaXNpdGVkTGluZSA9IHsgbGluZU51bWJlcjogMCwgdmFsdWU6ICcnIH07XG5cdFx0dGhpcy5jb21wdXRlQnVmZmVyTWV0YWRhdGEoKTtcblx0fVxuXG5cdG5vcm1hbGl6ZUVPTChlb2w6ICdcXHJcXG4nIHwgJ1xcbicpIHtcblx0XHRjb25zdCBhdmVyYWdlQnVmZmVyU2l6ZSA9IEF2ZXJhZ2VCdWZmZXJTaXplO1xuXHRcdGNvbnN0IG1pbiA9IGF2ZXJhZ2VCdWZmZXJTaXplIC0gTWF0aC5mbG9vcihhdmVyYWdlQnVmZmVyU2l6ZSAvIDMpO1xuXHRcdGNvbnN0IG1heCA9IG1pbiAqIDI7XG5cblx0XHRsZXQgdGVtcENodW5rID0gJyc7XG5cdFx0bGV0IHRlbXBDaHVua0xlbiA9IDA7XG5cdFx0Y29uc3QgY2h1bmtzOiBTdHJpbmdCdWZmZXJbXSA9IFtdO1xuXG5cdFx0dGhpcy5pdGVyYXRlKHRoaXMucm9vdCwgbm9kZSA9PiB7XG5cdFx0XHRjb25zdCBzdHIgPSB0aGlzLmdldE5vZGVDb250ZW50KG5vZGUpO1xuXHRcdFx0Y29uc3QgbGVuID0gc3RyLmxlbmd0aDtcblx0XHRcdGlmICh0ZW1wQ2h1bmtMZW4gPD0gbWluIHx8IHRlbXBDaHVua0xlbiArIGxlbiA8IG1heCkge1xuXHRcdFx0XHR0ZW1wQ2h1bmsgKz0gc3RyO1xuXHRcdFx0XHR0ZW1wQ2h1bmtMZW4gKz0gbGVuO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZmx1c2ggYW55d2F5c1xuXHRcdFx0Y29uc3QgdGV4dCA9IHRlbXBDaHVuay5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbi9nLCBlb2wpO1xuXHRcdFx0Y2h1bmtzLnB1c2gobmV3IFN0cmluZ0J1ZmZlcih0ZXh0LCBjcmVhdGVMaW5lU3RhcnRzRmFzdCh0ZXh0KSkpO1xuXHRcdFx0dGVtcENodW5rID0gc3RyO1xuXHRcdFx0dGVtcENodW5rTGVuID0gbGVuO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRpZiAodGVtcENodW5rTGVuID4gMCkge1xuXHRcdFx0Y29uc3QgdGV4dCA9IHRlbXBDaHVuay5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbi9nLCBlb2wpO1xuXHRcdFx0Y2h1bmtzLnB1c2gobmV3IFN0cmluZ0J1ZmZlcih0ZXh0LCBjcmVhdGVMaW5lU3RhcnRzRmFzdCh0ZXh0KSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuY3JlYXRlKGNodW5rcywgZW9sLCB0cnVlKTtcblx0fVxuXG5cdC8vICNyZWdpb24gQnVmZmVyIEFQSVxuXHRwdWJsaWMgZ2V0RU9MKCk6ICdcXHJcXG4nIHwgJ1xcbicge1xuXHRcdHJldHVybiB0aGlzLl9FT0w7XG5cdH1cblxuXHRwdWJsaWMgc2V0RU9MKG5ld0VPTDogJ1xcclxcbicgfCAnXFxuJyk6IHZvaWQge1xuXHRcdHRoaXMuX0VPTCA9IG5ld0VPTDtcblx0XHR0aGlzLl9FT0xMZW5ndGggPSB0aGlzLl9FT0wubGVuZ3RoO1xuXHRcdHRoaXMubm9ybWFsaXplRU9MKG5ld0VPTCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QoQk9NOiBzdHJpbmcpOiBJVGV4dFNuYXBzaG90IHtcblx0XHRyZXR1cm4gbmV3IFBpZWNlVHJlZVNuYXBzaG90KHRoaXMsIEJPTSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWwob3RoZXI6IFBpZWNlVHJlZUJhc2UpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5nZXRMZW5ndGgoKSAhPT0gb3RoZXIuZ2V0TGVuZ3RoKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZ2V0TGluZUNvdW50KCkgIT09IG90aGVyLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0Y29uc3QgcmV0ID0gdGhpcy5pdGVyYXRlKHRoaXMucm9vdCwgbm9kZSA9PiB7XG5cdFx0XHRpZiAobm9kZSA9PT0gU0VOVElORUwpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdHIgPSB0aGlzLmdldE5vZGVDb250ZW50KG5vZGUpO1xuXHRcdFx0Y29uc3QgbGVuID0gc3RyLmxlbmd0aDtcblx0XHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBvdGhlci5ub2RlQXQob2Zmc2V0KTtcblx0XHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gb3RoZXIubm9kZUF0KG9mZnNldCArIGxlbik7XG5cdFx0XHRjb25zdCB2YWwgPSBvdGhlci5nZXRWYWx1ZUluUmFuZ2UyKHN0YXJ0UG9zaXRpb24sIGVuZFBvc2l0aW9uKTtcblxuXHRcdFx0b2Zmc2V0ICs9IGxlbjtcblx0XHRcdHJldHVybiBzdHIgPT09IHZhbDtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T2Zmc2V0QXQobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxlZnRMZW4gPSAwOyAvLyBpbm9yZGVyXG5cblx0XHRsZXQgeCA9IHRoaXMucm9vdDtcblxuXHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0aWYgKHgubGVmdCAhPT0gU0VOVElORUwgJiYgeC5sZl9sZWZ0ICsgMSA+PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHggPSB4LmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHgubGZfbGVmdCArIHgucGllY2UubGluZUZlZWRDbnQgKyAxID49IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0bGVmdExlbiArPSB4LnNpemVfbGVmdDtcblx0XHRcdFx0Ly8gbGluZU51bWJlciA+PSAyXG5cdFx0XHRcdGNvbnN0IGFjY3VtdWFsdGVkVmFsSW5DdXJyZW50SW5kZXggPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIHgubGZfbGVmdCAtIDIpO1xuXHRcdFx0XHRyZXR1cm4gbGVmdExlbiArPSBhY2N1bXVhbHRlZFZhbEluQ3VycmVudEluZGV4ICsgY29sdW1uIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVOdW1iZXIgLT0geC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudDtcblx0XHRcdFx0bGVmdExlbiArPSB4LnNpemVfbGVmdCArIHgucGllY2UubGVuZ3RoO1xuXHRcdFx0XHR4ID0geC5yaWdodDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbGVmdExlbjtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbkF0KG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdG9mZnNldCA9IE1hdGguZmxvb3Iob2Zmc2V0KTtcblx0XHRvZmZzZXQgPSBNYXRoLm1heCgwLCBvZmZzZXQpO1xuXG5cdFx0bGV0IHggPSB0aGlzLnJvb3Q7XG5cdFx0bGV0IGxmQ250ID0gMDtcblx0XHRjb25zdCBvcmlnaW5hbE9mZnNldCA9IG9mZnNldDtcblxuXHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0aWYgKHguc2l6ZV9sZWZ0ICE9PSAwICYmIHguc2l6ZV9sZWZ0ID49IG9mZnNldCkge1xuXHRcdFx0XHR4ID0geC5sZWZ0O1xuXHRcdFx0fSBlbHNlIGlmICh4LnNpemVfbGVmdCArIHgucGllY2UubGVuZ3RoID49IG9mZnNldCkge1xuXHRcdFx0XHRjb25zdCBvdXQgPSB0aGlzLmdldEluZGV4T2YoeCwgb2Zmc2V0IC0geC5zaXplX2xlZnQpO1xuXG5cdFx0XHRcdGxmQ250ICs9IHgubGZfbGVmdCArIG91dC5pbmRleDtcblxuXHRcdFx0XHRpZiAob3V0LmluZGV4ID09PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZVN0YXJ0T2Zmc2V0ID0gdGhpcy5nZXRPZmZzZXRBdChsZkNudCArIDEsIDEpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbHVtbiA9IG9yaWdpbmFsT2Zmc2V0IC0gbGluZVN0YXJ0T2Zmc2V0O1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGZDbnQgKyAxLCBjb2x1bW4gKyAxKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGZDbnQgKyAxLCBvdXQucmVtYWluZGVyICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvZmZzZXQgLT0geC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdFx0bGZDbnQgKz0geC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudDtcblxuXHRcdFx0XHRpZiAoeC5yaWdodCA9PT0gU0VOVElORUwpIHtcblx0XHRcdFx0XHQvLyBsYXN0IG5vZGVcblx0XHRcdFx0XHRjb25zdCBsaW5lU3RhcnRPZmZzZXQgPSB0aGlzLmdldE9mZnNldEF0KGxmQ250ICsgMSwgMSk7XG5cdFx0XHRcdFx0Y29uc3QgY29sdW1uID0gb3JpZ2luYWxPZmZzZXQgLSBvZmZzZXQgLSBsaW5lU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsZkNudCArIDEsIGNvbHVtbiArIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHggPSB4LnJpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbigxLCAxKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZUluUmFuZ2UocmFuZ2U6IFJhbmdlLCBlb2w/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgJiYgcmFuZ2Uuc3RhcnRDb2x1bW4gPT09IHJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSB0aGlzLm5vZGVBdDIocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSB0aGlzLm5vZGVBdDIocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5nZXRWYWx1ZUluUmFuZ2UyKHN0YXJ0UG9zaXRpb24sIGVuZFBvc2l0aW9uKTtcblx0XHRpZiAoZW9sKSB7XG5cdFx0XHRpZiAoZW9sICE9PSB0aGlzLl9FT0wgfHwgIXRoaXMuX0VPTE5vcm1hbGl6ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csIGVvbCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlb2wgPT09IHRoaXMuZ2V0RU9MKCkgJiYgdGhpcy5fRU9MTm9ybWFsaXplZCkge1xuXHRcdFx0XHRpZiAoZW9sID09PSAnXFxyXFxuJykge1xuXG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csIGVvbCk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZUluUmFuZ2UyKHN0YXJ0UG9zaXRpb246IE5vZGVQb3NpdGlvbiwgZW5kUG9zaXRpb246IE5vZGVQb3NpdGlvbik6IHN0cmluZyB7XG5cdFx0aWYgKHN0YXJ0UG9zaXRpb24ubm9kZSA9PT0gZW5kUG9zaXRpb24ubm9kZSkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHN0YXJ0UG9zaXRpb24ubm9kZTtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbm9kZS5waWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKG5vZGUucGllY2UuYnVmZmVySW5kZXgsIG5vZGUucGllY2Uuc3RhcnQpO1xuXHRcdFx0cmV0dXJuIGJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQgKyBzdGFydFBvc2l0aW9uLnJlbWFpbmRlciwgc3RhcnRPZmZzZXQgKyBlbmRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXHRcdH1cblxuXHRcdGxldCB4ID0gc3RhcnRQb3NpdGlvbi5ub2RlO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbeC5waWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcih4LnBpZWNlLmJ1ZmZlckluZGV4LCB4LnBpZWNlLnN0YXJ0KTtcblx0XHRsZXQgcmV0ID0gYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCArIHN0YXJ0UG9zaXRpb24ucmVtYWluZGVyLCBzdGFydE9mZnNldCArIHgucGllY2UubGVuZ3RoKTtcblxuXHRcdHggPSB4Lm5leHQoKTtcblx0XHR3aGlsZSAoeCAhPT0gU0VOVElORUwpIHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbeC5waWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHgucGllY2UuYnVmZmVySW5kZXgsIHgucGllY2Uuc3RhcnQpO1xuXG5cdFx0XHRpZiAoeCA9PT0gZW5kUG9zaXRpb24ubm9kZSkge1xuXHRcdFx0XHRyZXQgKz0gYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCwgc3RhcnRPZmZzZXQgKyBlbmRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldCArPSBidWZmZXIuc3Vic3RyKHN0YXJ0T2Zmc2V0LCB4LnBpZWNlLmxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdHggPSB4Lm5leHQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHVibGljIGdldExpbmVzQ29udGVudCgpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGxpbmVzTGVuZ3RoID0gMDtcblx0XHRsZXQgY3VycmVudExpbmUgPSAnJztcblx0XHRsZXQgZGFuZ2xpbmdDUiA9IGZhbHNlO1xuXG5cdFx0dGhpcy5pdGVyYXRlKHRoaXMucm9vdCwgbm9kZSA9PiB7XG5cdFx0XHRpZiAobm9kZSA9PT0gU0VOVElORUwpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRcdGxldCBwaWVjZUxlbmd0aCA9IHBpZWNlLmxlbmd0aDtcblx0XHRcdGlmIChwaWVjZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1twaWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdFx0Y29uc3QgbGluZVN0YXJ0cyA9IHRoaXMuX2J1ZmZlcnNbcGllY2UuYnVmZmVySW5kZXhdLmxpbmVTdGFydHM7XG5cblx0XHRcdGNvbnN0IHBpZWNlU3RhcnRMaW5lID0gcGllY2Uuc3RhcnQubGluZTtcblx0XHRcdGNvbnN0IHBpZWNlRW5kTGluZSA9IHBpZWNlLmVuZC5saW5lO1xuXHRcdFx0bGV0IHBpZWNlU3RhcnRPZmZzZXQgPSBsaW5lU3RhcnRzW3BpZWNlU3RhcnRMaW5lXSArIHBpZWNlLnN0YXJ0LmNvbHVtbjtcblxuXHRcdFx0aWYgKGRhbmdsaW5nQ1IpIHtcblx0XHRcdFx0aWYgKGJ1ZmZlci5jaGFyQ29kZUF0KHBpZWNlU3RhcnRPZmZzZXQpID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0XHRcdC8vIHByZXRlbmQgdGhlIFxcbiB3YXMgaW4gdGhlIHByZXZpb3VzIHBpZWNlLi5cblx0XHRcdFx0XHRwaWVjZVN0YXJ0T2Zmc2V0Kys7XG5cdFx0XHRcdFx0cGllY2VMZW5ndGgtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsaW5lc1tsaW5lc0xlbmd0aCsrXSA9IGN1cnJlbnRMaW5lO1xuXHRcdFx0XHRjdXJyZW50TGluZSA9ICcnO1xuXHRcdFx0XHRkYW5nbGluZ0NSID0gZmFsc2U7XG5cdFx0XHRcdGlmIChwaWVjZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwaWVjZVN0YXJ0TGluZSA9PT0gcGllY2VFbmRMaW5lKSB7XG5cdFx0XHRcdC8vIHRoaXMgcGllY2UgaGFzIG5vIG5ldyBsaW5lc1xuXHRcdFx0XHRpZiAoIXRoaXMuX0VPTE5vcm1hbGl6ZWQgJiYgYnVmZmVyLmNoYXJDb2RlQXQocGllY2VTdGFydE9mZnNldCArIHBpZWNlTGVuZ3RoIC0gMSkgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuKSB7XG5cdFx0XHRcdFx0ZGFuZ2xpbmdDUiA9IHRydWU7XG5cdFx0XHRcdFx0Y3VycmVudExpbmUgKz0gYnVmZmVyLnN1YnN0cihwaWVjZVN0YXJ0T2Zmc2V0LCBwaWVjZUxlbmd0aCAtIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnJlbnRMaW5lICs9IGJ1ZmZlci5zdWJzdHIocGllY2VTdGFydE9mZnNldCwgcGllY2VMZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhZGQgdGhlIHRleHQgYmVmb3JlIHRoZSBmaXJzdCBsaW5lIHN0YXJ0IGluIHRoaXMgcGllY2Vcblx0XHRcdGN1cnJlbnRMaW5lICs9IChcblx0XHRcdFx0dGhpcy5fRU9MTm9ybWFsaXplZFxuXHRcdFx0XHRcdD8gYnVmZmVyLnN1YnN0cmluZyhwaWVjZVN0YXJ0T2Zmc2V0LCBNYXRoLm1heChwaWVjZVN0YXJ0T2Zmc2V0LCBsaW5lU3RhcnRzW3BpZWNlU3RhcnRMaW5lICsgMV0gLSB0aGlzLl9FT0xMZW5ndGgpKVxuXHRcdFx0XHRcdDogYnVmZmVyLnN1YnN0cmluZyhwaWVjZVN0YXJ0T2Zmc2V0LCBsaW5lU3RhcnRzW3BpZWNlU3RhcnRMaW5lICsgMV0pLnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikkLywgJycpXG5cdFx0XHQpO1xuXHRcdFx0bGluZXNbbGluZXNMZW5ndGgrK10gPSBjdXJyZW50TGluZTtcblxuXHRcdFx0Zm9yIChsZXQgbGluZSA9IHBpZWNlU3RhcnRMaW5lICsgMTsgbGluZSA8IHBpZWNlRW5kTGluZTsgbGluZSsrKSB7XG5cdFx0XHRcdGN1cnJlbnRMaW5lID0gKFxuXHRcdFx0XHRcdHRoaXMuX0VPTE5vcm1hbGl6ZWRcblx0XHRcdFx0XHRcdD8gYnVmZmVyLnN1YnN0cmluZyhsaW5lU3RhcnRzW2xpbmVdLCBsaW5lU3RhcnRzW2xpbmUgKyAxXSAtIHRoaXMuX0VPTExlbmd0aClcblx0XHRcdFx0XHRcdDogYnVmZmVyLnN1YnN0cmluZyhsaW5lU3RhcnRzW2xpbmVdLCBsaW5lU3RhcnRzW2xpbmUgKyAxXSkucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKSQvLCAnJylcblx0XHRcdFx0KTtcblx0XHRcdFx0bGluZXNbbGluZXNMZW5ndGgrK10gPSBjdXJyZW50TGluZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9FT0xOb3JtYWxpemVkICYmIGJ1ZmZlci5jaGFyQ29kZUF0KGxpbmVTdGFydHNbcGllY2VFbmRMaW5lXSArIHBpZWNlLmVuZC5jb2x1bW4gLSAxKSA9PT0gQ2hhckNvZGUuQ2FycmlhZ2VSZXR1cm4pIHtcblx0XHRcdFx0ZGFuZ2xpbmdDUiA9IHRydWU7XG5cdFx0XHRcdGlmIChwaWVjZS5lbmQuY29sdW1uID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIGxhc3QgbGluZSBlbmRlZCB3aXRoIGEgXFxyLCBsZXQncyB1bmRvIHRoZSBwdXNoLCBpdCB3aWxsIGJlIHB1c2hlZCBieSBuZXh0IGl0ZXJhdGlvblxuXHRcdFx0XHRcdGxpbmVzTGVuZ3RoLS07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3VycmVudExpbmUgPSBidWZmZXIuc3Vic3RyKGxpbmVTdGFydHNbcGllY2VFbmRMaW5lXSwgcGllY2UuZW5kLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50TGluZSA9IGJ1ZmZlci5zdWJzdHIobGluZVN0YXJ0c1twaWVjZUVuZExpbmVdLCBwaWVjZS5lbmQuY29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRpZiAoZGFuZ2xpbmdDUikge1xuXHRcdFx0bGluZXNbbGluZXNMZW5ndGgrK10gPSBjdXJyZW50TGluZTtcblx0XHRcdGN1cnJlbnRMaW5lID0gJyc7XG5cdFx0fVxuXG5cdFx0bGluZXNbbGluZXNMZW5ndGgrK10gPSBjdXJyZW50TGluZTtcblx0XHRyZXR1cm4gbGluZXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZUNudDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9sYXN0VmlzaXRlZExpbmUubGluZU51bWJlciA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhc3RWaXNpdGVkTGluZS52YWx1ZTtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0VmlzaXRlZExpbmUubGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cblx0XHRpZiAobGluZU51bWJlciA9PT0gdGhpcy5fbGluZUNudCkge1xuXHRcdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lLnZhbHVlID0gdGhpcy5nZXRMaW5lUmF3Q29udGVudChsaW5lTnVtYmVyKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX0VPTE5vcm1hbGl6ZWQpIHtcblx0XHRcdHRoaXMuX2xhc3RWaXNpdGVkTGluZS52YWx1ZSA9IHRoaXMuZ2V0TGluZVJhd0NvbnRlbnQobGluZU51bWJlciwgdGhpcy5fRU9MTGVuZ3RoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lLnZhbHVlID0gdGhpcy5nZXRMaW5lUmF3Q29udGVudChsaW5lTnVtYmVyKS5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pJC8sICcnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbGFzdFZpc2l0ZWRMaW5lLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2hhckNvZGUobm9kZVBvczogTm9kZVBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAobm9kZVBvcy5yZW1haW5kZXIgPT09IG5vZGVQb3Mubm9kZS5waWVjZS5sZW5ndGgpIHtcblx0XHRcdC8vIHRoZSBjaGFyIHdlIHdhbnQgdG8gZmV0Y2ggaXMgYXQgdGhlIGhlYWQgb2YgbmV4dCBub2RlLlxuXHRcdFx0Y29uc3QgbWF0Y2hpbmdOb2RlID0gbm9kZVBvcy5ub2RlLm5leHQoKTtcblx0XHRcdGlmICghbWF0Y2hpbmdOb2RlKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW21hdGNoaW5nTm9kZS5waWVjZS5idWZmZXJJbmRleF07XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIobWF0Y2hpbmdOb2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBtYXRjaGluZ05vZGUucGllY2Uuc3RhcnQpO1xuXHRcdFx0cmV0dXJuIGJ1ZmZlci5idWZmZXIuY2hhckNvZGVBdChzdGFydE9mZnNldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbm9kZVBvcy5ub2RlLnBpZWNlLmJ1ZmZlckluZGV4XTtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihub2RlUG9zLm5vZGUucGllY2UuYnVmZmVySW5kZXgsIG5vZGVQb3Mubm9kZS5waWVjZS5zdGFydCk7XG5cdFx0XHRjb25zdCB0YXJnZXRPZmZzZXQgPSBzdGFydE9mZnNldCArIG5vZGVQb3MucmVtYWluZGVyO1xuXG5cdFx0XHRyZXR1cm4gYnVmZmVyLmJ1ZmZlci5jaGFyQ29kZUF0KHRhcmdldE9mZnNldCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldExpbmVDaGFyQ29kZShsaW5lTnVtYmVyOiBudW1iZXIsIGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IG5vZGVQb3MgPSB0aGlzLm5vZGVBdDIobGluZU51bWJlciwgaW5kZXggKyAxKTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2hhckNvZGUobm9kZVBvcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChsaW5lTnVtYmVyID09PSB0aGlzLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuZ2V0T2Zmc2V0QXQobGluZU51bWJlciwgMSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRMZW5ndGgoKSAtIHN0YXJ0T2Zmc2V0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRPZmZzZXRBdChsaW5lTnVtYmVyICsgMSwgMSkgLSB0aGlzLmdldE9mZnNldEF0KGxpbmVOdW1iZXIsIDEpIC0gdGhpcy5fRU9MTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldENoYXJDb2RlKG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBub2RlUG9zID0gdGhpcy5ub2RlQXQob2Zmc2V0KTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2hhckNvZGUobm9kZVBvcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TmVhcmVzdENodW5rKG9mZnNldDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBub2RlUG9zID0gdGhpcy5ub2RlQXQob2Zmc2V0KTtcblx0XHRpZiAobm9kZVBvcy5yZW1haW5kZXIgPT09IG5vZGVQb3Mubm9kZS5waWVjZS5sZW5ndGgpIHtcblx0XHRcdC8vIHRoZSBvZmZzZXQgaXMgYXQgdGhlIGhlYWQgb2YgbmV4dCBub2RlLlxuXHRcdFx0Y29uc3QgbWF0Y2hpbmdOb2RlID0gbm9kZVBvcy5ub2RlLm5leHQoKTtcblx0XHRcdGlmICghbWF0Y2hpbmdOb2RlIHx8IG1hdGNoaW5nTm9kZSA9PT0gU0VOVElORUwpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW21hdGNoaW5nTm9kZS5waWVjZS5idWZmZXJJbmRleF07XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIobWF0Y2hpbmdOb2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBtYXRjaGluZ05vZGUucGllY2Uuc3RhcnQpO1xuXHRcdFx0cmV0dXJuIGJ1ZmZlci5idWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBzdGFydE9mZnNldCArIG1hdGNoaW5nTm9kZS5waWVjZS5sZW5ndGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW25vZGVQb3Mubm9kZS5waWVjZS5idWZmZXJJbmRleF07XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIobm9kZVBvcy5ub2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBub2RlUG9zLm5vZGUucGllY2Uuc3RhcnQpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0T2Zmc2V0ID0gc3RhcnRPZmZzZXQgKyBub2RlUG9zLnJlbWFpbmRlcjtcblx0XHRcdGNvbnN0IHRhcmdldEVuZCA9IHN0YXJ0T2Zmc2V0ICsgbm9kZVBvcy5ub2RlLnBpZWNlLmxlbmd0aDtcblx0XHRcdHJldHVybiBidWZmZXIuYnVmZmVyLnN1YnN0cmluZyh0YXJnZXRPZmZzZXQsIHRhcmdldEVuZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZpbmRNYXRjaGVzSW5Ob2RlKG5vZGU6IFRyZWVOb2RlLCBzZWFyY2hlcjogU2VhcmNoZXIsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBzdGFydEN1cnNvcjogQnVmZmVyQ3Vyc29yLCBlbmRDdXJzb3I6IEJ1ZmZlckN1cnNvciwgc2VhcmNoRGF0YTogU2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlciwgcmVzdWx0TGVuOiBudW1iZXIsIHJlc3VsdDogRmluZE1hdGNoW10pIHtcblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW25vZGUucGllY2UuYnVmZmVySW5kZXhdO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0SW5CdWZmZXIgPSB0aGlzLm9mZnNldEluQnVmZmVyKG5vZGUucGllY2UuYnVmZmVySW5kZXgsIG5vZGUucGllY2Uuc3RhcnQpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihub2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBzdGFydEN1cnNvcik7XG5cdFx0Y29uc3QgZW5kID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihub2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBlbmRDdXJzb3IpO1xuXG5cdFx0bGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0Ly8gUmVzZXQgcmVnZXggdG8gc2VhcmNoIGZyb20gdGhlIGJlZ2lubmluZ1xuXHRcdGNvbnN0IHJldDogQnVmZmVyQ3Vyc29yID0geyBsaW5lOiAwLCBjb2x1bW46IDAgfTtcblx0XHRsZXQgc2VhcmNoVGV4dDogc3RyaW5nO1xuXHRcdGxldCBvZmZzZXRJbkJ1ZmZlcjogKG9mZnNldDogbnVtYmVyKSA9PiBudW1iZXI7XG5cblx0XHRpZiAoc2VhcmNoZXIuX3dvcmRTZXBhcmF0b3JzKSB7XG5cdFx0XHRzZWFyY2hUZXh0ID0gYnVmZmVyLmJ1ZmZlci5zdWJzdHJpbmcoc3RhcnQsIGVuZCk7XG5cdFx0XHRvZmZzZXRJbkJ1ZmZlciA9IChvZmZzZXQ6IG51bWJlcikgPT4gb2Zmc2V0ICsgc3RhcnQ7XG5cdFx0XHRzZWFyY2hlci5yZXNldCgwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VhcmNoVGV4dCA9IGJ1ZmZlci5idWZmZXI7XG5cdFx0XHRvZmZzZXRJbkJ1ZmZlciA9IChvZmZzZXQ6IG51bWJlcikgPT4gb2Zmc2V0O1xuXHRcdFx0c2VhcmNoZXIucmVzZXQoc3RhcnQpO1xuXHRcdH1cblxuXHRcdGRvIHtcblx0XHRcdG0gPSBzZWFyY2hlci5uZXh0KHNlYXJjaFRleHQpO1xuXG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRpZiAob2Zmc2V0SW5CdWZmZXIobS5pbmRleCkgPj0gZW5kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnBvc2l0aW9uSW5CdWZmZXIobm9kZSwgb2Zmc2V0SW5CdWZmZXIobS5pbmRleCkgLSBzdGFydE9mZnNldEluQnVmZmVyLCByZXQpO1xuXHRcdFx0XHRjb25zdCBsaW5lRmVlZENudCA9IHRoaXMuZ2V0TGluZUZlZWRDbnQobm9kZS5waWVjZS5idWZmZXJJbmRleCwgc3RhcnRDdXJzb3IsIHJldCk7XG5cdFx0XHRcdGNvbnN0IHJldFN0YXJ0Q29sdW1uID0gcmV0LmxpbmUgPT09IHN0YXJ0Q3Vyc29yLmxpbmUgPyByZXQuY29sdW1uIC0gc3RhcnRDdXJzb3IuY29sdW1uICsgc3RhcnRDb2x1bW4gOiByZXQuY29sdW1uICsgMTtcblx0XHRcdFx0Y29uc3QgcmV0RW5kQ29sdW1uID0gcmV0U3RhcnRDb2x1bW4gKyBtWzBdLmxlbmd0aDtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IGNyZWF0ZUZpbmRNYXRjaChuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyICsgbGluZUZlZWRDbnQsIHJldFN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIgKyBsaW5lRmVlZENudCwgcmV0RW5kQ29sdW1uKSwgbSwgY2FwdHVyZU1hdGNoZXMpO1xuXG5cdFx0XHRcdGlmIChvZmZzZXRJbkJ1ZmZlcihtLmluZGV4KSArIG1bMF0ubGVuZ3RoID49IGVuZCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHRMZW47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlc3VsdExlbiA+PSBsaW1pdFJlc3VsdENvdW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSB3aGlsZSAobSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHR9XG5cblx0cHVibGljIGZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZTogUmFuZ2UsIHNlYXJjaERhdGE6IFNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBGaW5kTWF0Y2hbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBGaW5kTWF0Y2hbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGNvbnN0IHNlYXJjaGVyID0gbmV3IFNlYXJjaGVyKHNlYXJjaERhdGEud29yZFNlcGFyYXRvcnMsIHNlYXJjaERhdGEucmVnZXgpO1xuXG5cdFx0bGV0IHN0YXJ0UG9zaXRpb24gPSB0aGlzLm5vZGVBdDIoc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzZWFyY2hSYW5nZS5zdGFydENvbHVtbik7XG5cdFx0aWYgKHN0YXJ0UG9zaXRpb24gPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSB0aGlzLm5vZGVBdDIoc2VhcmNoUmFuZ2UuZW5kTGluZU51bWJlciwgc2VhcmNoUmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRpZiAoZW5kUG9zaXRpb24gPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0bGV0IHN0YXJ0ID0gdGhpcy5wb3NpdGlvbkluQnVmZmVyKHN0YXJ0UG9zaXRpb24ubm9kZSwgc3RhcnRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXHRcdGNvbnN0IGVuZCA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihlbmRQb3NpdGlvbi5ub2RlLCBlbmRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXG5cdFx0aWYgKHN0YXJ0UG9zaXRpb24ubm9kZSA9PT0gZW5kUG9zaXRpb24ubm9kZSkge1xuXHRcdFx0dGhpcy5maW5kTWF0Y2hlc0luTm9kZShzdGFydFBvc2l0aW9uLm5vZGUsIHNlYXJjaGVyLCBzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIsIHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uLCBzdGFydCwgZW5kLCBzZWFyY2hEYXRhLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCwgcmVzdWx0TGVuLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0bGV0IGN1cnJlbnROb2RlID0gc3RhcnRQb3NpdGlvbi5ub2RlO1xuXHRcdHdoaWxlIChjdXJyZW50Tm9kZSAhPT0gZW5kUG9zaXRpb24ubm9kZSkge1xuXHRcdFx0Y29uc3QgbGluZUJyZWFrQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChjdXJyZW50Tm9kZS5waWVjZS5idWZmZXJJbmRleCwgc3RhcnQsIGN1cnJlbnROb2RlLnBpZWNlLmVuZCk7XG5cblx0XHRcdGlmIChsaW5lQnJlYWtDbnQgPj0gMSkge1xuXHRcdFx0XHQvLyBsYXN0IGxpbmUgYnJlYWsgcG9zaXRpb25cblx0XHRcdFx0Y29uc3QgbGluZVN0YXJ0cyA9IHRoaXMuX2J1ZmZlcnNbY3VycmVudE5vZGUucGllY2UuYnVmZmVySW5kZXhdLmxpbmVTdGFydHM7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0SW5CdWZmZXIgPSB0aGlzLm9mZnNldEluQnVmZmVyKGN1cnJlbnROb2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBjdXJyZW50Tm9kZS5waWVjZS5zdGFydCk7XG5cdFx0XHRcdGNvbnN0IG5leHRMaW5lU3RhcnRPZmZzZXQgPSBsaW5lU3RhcnRzW3N0YXJ0LmxpbmUgKyBsaW5lQnJlYWtDbnRdO1xuXHRcdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IHN0YXJ0TGluZU51bWJlciA9PT0gc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID8gc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4gOiAxO1xuXHRcdFx0XHRyZXN1bHRMZW4gPSB0aGlzLmZpbmRNYXRjaGVzSW5Ob2RlKGN1cnJlbnROb2RlLCBzZWFyY2hlciwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnQsIHRoaXMucG9zaXRpb25JbkJ1ZmZlcihjdXJyZW50Tm9kZSwgbmV4dExpbmVTdGFydE9mZnNldCAtIHN0YXJ0T2Zmc2V0SW5CdWZmZXIpLCBzZWFyY2hEYXRhLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCwgcmVzdWx0TGVuLCByZXN1bHQpO1xuXG5cdFx0XHRcdGlmIChyZXN1bHRMZW4gPj0gbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgKz0gbGluZUJyZWFrQ250O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IHN0YXJ0TGluZU51bWJlciA9PT0gc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID8gc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIDogMDtcblx0XHRcdC8vIHNlYXJjaCBmb3IgdGhlIHJlbWFpbmluZyBjb250ZW50XG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyID09PSBzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSB0aGlzLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikuc3Vic3RyaW5nKHN0YXJ0Q29sdW1uLCBzZWFyY2hSYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0cmVzdWx0TGVuID0gdGhpcy5fZmluZE1hdGNoZXNJbkxpbmUoc2VhcmNoRGF0YSwgc2VhcmNoZXIsIHRleHQsIHNlYXJjaFJhbmdlLmVuZExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCByZXN1bHRMZW4sIHJlc3VsdCwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRMZW4gPSB0aGlzLl9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhLCBzZWFyY2hlciwgdGhpcy5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLnN1YnN0cihzdGFydENvbHVtbiksIHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHJlc3VsdExlbiwgcmVzdWx0LCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cblx0XHRcdGlmIChyZXN1bHRMZW4gPj0gbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRzdGFydExpbmVOdW1iZXIrKztcblx0XHRcdHN0YXJ0UG9zaXRpb24gPSB0aGlzLm5vZGVBdDIoc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdGN1cnJlbnROb2RlID0gc3RhcnRQb3NpdGlvbi5ub2RlO1xuXHRcdFx0c3RhcnQgPSB0aGlzLnBvc2l0aW9uSW5CdWZmZXIoc3RhcnRQb3NpdGlvbi5ub2RlLCBzdGFydFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA9PT0gc2VhcmNoUmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBzdGFydExpbmVOdW1iZXIgPT09IHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciA/IHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uIC0gMSA6IDA7XG5cdFx0XHRjb25zdCB0ZXh0ID0gdGhpcy5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLnN1YnN0cmluZyhzdGFydENvbHVtbiwgc2VhcmNoUmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRyZXN1bHRMZW4gPSB0aGlzLl9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhLCBzZWFyY2hlciwgdGV4dCwgc2VhcmNoUmFuZ2UuZW5kTGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHJlc3VsdExlbiwgcmVzdWx0LCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gc3RhcnRMaW5lTnVtYmVyID09PSBzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIgPyBzZWFyY2hSYW5nZS5zdGFydENvbHVtbiA6IDE7XG5cdFx0cmVzdWx0TGVuID0gdGhpcy5maW5kTWF0Y2hlc0luTm9kZShlbmRQb3NpdGlvbi5ub2RlLCBzZWFyY2hlciwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnQsIGVuZCwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQsIHJlc3VsdExlbiwgcmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1hdGNoZXNJbkxpbmUoc2VhcmNoRGF0YTogU2VhcmNoRGF0YSwgc2VhcmNoZXI6IFNlYXJjaGVyLCB0ZXh0OiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFPZmZzZXQ6IG51bWJlciwgcmVzdWx0TGVuOiBudW1iZXIsIHJlc3VsdDogRmluZE1hdGNoW10sIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycztcblx0XHRpZiAoIWNhcHR1cmVNYXRjaGVzICYmIHNlYXJjaERhdGEuc2ltcGxlU2VhcmNoKSB7XG5cdFx0XHRjb25zdCBzZWFyY2hTdHJpbmcgPSBzZWFyY2hEYXRhLnNpbXBsZVNlYXJjaDtcblx0XHRcdGNvbnN0IHNlYXJjaFN0cmluZ0xlbiA9IHNlYXJjaFN0cmluZy5sZW5ndGg7XG5cdFx0XHRjb25zdCB0ZXh0TGVuZ3RoID0gdGV4dC5sZW5ndGg7XG5cblx0XHRcdGxldCBsYXN0TWF0Y2hJbmRleCA9IC1zZWFyY2hTdHJpbmdMZW47XG5cdFx0XHR3aGlsZSAoKGxhc3RNYXRjaEluZGV4ID0gdGV4dC5pbmRleE9mKHNlYXJjaFN0cmluZywgbGFzdE1hdGNoSW5kZXggKyBzZWFyY2hTdHJpbmdMZW4pKSAhPT0gLTEpIHtcblx0XHRcdFx0aWYgKCF3b3JkU2VwYXJhdG9ycyB8fCBpc1ZhbGlkTWF0Y2god29yZFNlcGFyYXRvcnMsIHRleHQsIHRleHRMZW5ndGgsIGxhc3RNYXRjaEluZGV4LCBzZWFyY2hTdHJpbmdMZW4pKSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIGxhc3RNYXRjaEluZGV4ICsgMSArIGRlbHRhT2Zmc2V0LCBsaW5lTnVtYmVyLCBsYXN0TWF0Y2hJbmRleCArIDEgKyBzZWFyY2hTdHJpbmdMZW4gKyBkZWx0YU9mZnNldCksIG51bGwpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHRMZW4gPj0gbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHRMZW47XG5cdFx0fVxuXG5cdFx0bGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0Ly8gUmVzZXQgcmVnZXggdG8gc2VhcmNoIGZyb20gdGhlIGJlZ2lubmluZ1xuXHRcdHNlYXJjaGVyLnJlc2V0KDApO1xuXHRcdGRvIHtcblx0XHRcdG0gPSBzZWFyY2hlci5uZXh0KHRleHQpO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IGNyZWF0ZUZpbmRNYXRjaChuZXcgUmFuZ2UobGluZU51bWJlciwgbS5pbmRleCArIDEgKyBkZWx0YU9mZnNldCwgbGluZU51bWJlciwgbS5pbmRleCArIDEgKyBtWzBdLmxlbmd0aCArIGRlbHRhT2Zmc2V0KSwgbSwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdFx0XHRpZiAocmVzdWx0TGVuID49IGxpbWl0UmVzdWx0Q291bnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSB3aGlsZSAobSk7XG5cdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFBpZWNlIFRhYmxlXG5cdHB1YmxpYyBpbnNlcnQob2Zmc2V0OiBudW1iZXIsIHZhbHVlOiBzdHJpbmcsIGVvbE5vcm1hbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX0VPTE5vcm1hbGl6ZWQgPSB0aGlzLl9FT0xOb3JtYWxpemVkICYmIGVvbE5vcm1hbGl6ZWQ7XG5cdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lLmxpbmVOdW1iZXIgPSAwO1xuXHRcdHRoaXMuX2xhc3RWaXNpdGVkTGluZS52YWx1ZSA9ICcnO1xuXG5cdFx0aWYgKHRoaXMucm9vdCAhPT0gU0VOVElORUwpIHtcblx0XHRcdGNvbnN0IHsgbm9kZSwgcmVtYWluZGVyLCBub2RlU3RhcnRPZmZzZXQgfSA9IHRoaXMubm9kZUF0KG9mZnNldCk7XG5cdFx0XHRjb25zdCBwaWVjZSA9IG5vZGUucGllY2U7XG5cdFx0XHRjb25zdCBidWZmZXJJbmRleCA9IHBpZWNlLmJ1ZmZlckluZGV4O1xuXHRcdFx0Y29uc3QgaW5zZXJ0UG9zSW5CdWZmZXIgPSB0aGlzLnBvc2l0aW9uSW5CdWZmZXIobm9kZSwgcmVtYWluZGVyKTtcblx0XHRcdGlmIChub2RlLnBpZWNlLmJ1ZmZlckluZGV4ID09PSAwICYmXG5cdFx0XHRcdHBpZWNlLmVuZC5saW5lID09PSB0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zLmxpbmUgJiZcblx0XHRcdFx0cGllY2UuZW5kLmNvbHVtbiA9PT0gdGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcy5jb2x1bW4gJiZcblx0XHRcdFx0KG5vZGVTdGFydE9mZnNldCArIHBpZWNlLmxlbmd0aCA9PT0gb2Zmc2V0KSAmJlxuXHRcdFx0XHR2YWx1ZS5sZW5ndGggPCBBdmVyYWdlQnVmZmVyU2l6ZVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIGNoYW5nZWQgYnVmZmVyXG5cdFx0XHRcdHRoaXMuYXBwZW5kVG9Ob2RlKG5vZGUsIHZhbHVlKTtcblx0XHRcdFx0dGhpcy5jb21wdXRlQnVmZmVyTWV0YWRhdGEoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobm9kZVN0YXJ0T2Zmc2V0ID09PSBvZmZzZXQpIHtcblx0XHRcdFx0dGhpcy5pbnNlcnRDb250ZW50VG9Ob2RlTGVmdCh2YWx1ZSwgbm9kZSk7XG5cdFx0XHRcdHRoaXMuX3NlYXJjaENhY2hlLnZhbGlkYXRlKG9mZnNldCk7XG5cdFx0XHR9IGVsc2UgaWYgKG5vZGVTdGFydE9mZnNldCArIG5vZGUucGllY2UubGVuZ3RoID4gb2Zmc2V0KSB7XG5cdFx0XHRcdC8vIHdlIGFyZSBpbnNlcnRpbmcgaW50byB0aGUgbWlkZGxlIG9mIGEgbm9kZS5cblx0XHRcdFx0Y29uc3Qgbm9kZXNUb0RlbDogVHJlZU5vZGVbXSA9IFtdO1xuXHRcdFx0XHRsZXQgbmV3UmlnaHRQaWVjZSA9IG5ldyBQaWVjZShcblx0XHRcdFx0XHRwaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdFx0XHRpbnNlcnRQb3NJbkJ1ZmZlcixcblx0XHRcdFx0XHRwaWVjZS5lbmQsXG5cdFx0XHRcdFx0dGhpcy5nZXRMaW5lRmVlZENudChwaWVjZS5idWZmZXJJbmRleCwgaW5zZXJ0UG9zSW5CdWZmZXIsIHBpZWNlLmVuZCksXG5cdFx0XHRcdFx0dGhpcy5vZmZzZXRJbkJ1ZmZlcihidWZmZXJJbmRleCwgcGllY2UuZW5kKSAtIHRoaXMub2Zmc2V0SW5CdWZmZXIoYnVmZmVySW5kZXgsIGluc2VydFBvc0luQnVmZmVyKVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNob3VsZENoZWNrQ1JMRigpICYmIHRoaXMuZW5kV2l0aENSKHZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGhlYWRPZlJpZ2h0ID0gdGhpcy5ub2RlQ2hhckNvZGVBdChub2RlLCByZW1haW5kZXIpO1xuXG5cdFx0XHRcdFx0aWYgKGhlYWRPZlJpZ2h0ID09PSAxMCAvKiogXFxuICovKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdTdGFydDogQnVmZmVyQ3Vyc29yID0geyBsaW5lOiBuZXdSaWdodFBpZWNlLnN0YXJ0LmxpbmUgKyAxLCBjb2x1bW46IDAgfTtcblx0XHRcdFx0XHRcdG5ld1JpZ2h0UGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRcdFx0XHRcdG5ld1JpZ2h0UGllY2UuYnVmZmVySW5kZXgsXG5cdFx0XHRcdFx0XHRcdG5ld1N0YXJ0LFxuXHRcdFx0XHRcdFx0XHRuZXdSaWdodFBpZWNlLmVuZCxcblx0XHRcdFx0XHRcdFx0dGhpcy5nZXRMaW5lRmVlZENudChuZXdSaWdodFBpZWNlLmJ1ZmZlckluZGV4LCBuZXdTdGFydCwgbmV3UmlnaHRQaWVjZS5lbmQpLFxuXHRcdFx0XHRcdFx0XHRuZXdSaWdodFBpZWNlLmxlbmd0aCAtIDFcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdHZhbHVlICs9ICdcXG4nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHJldXNlIG5vZGUgZm9yIGNvbnRlbnQgYmVmb3JlIGluc2VydGlvbiBwb2ludC5cblx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkQ2hlY2tDUkxGKCkgJiYgdGhpcy5zdGFydFdpdGhMRih2YWx1ZSkpIHtcblx0XHRcdFx0XHRjb25zdCB0YWlsT2ZMZWZ0ID0gdGhpcy5ub2RlQ2hhckNvZGVBdChub2RlLCByZW1haW5kZXIgLSAxKTtcblx0XHRcdFx0XHRpZiAodGFpbE9mTGVmdCA9PT0gMTMgLyoqIFxcciAqLykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJldmlvdXNQb3MgPSB0aGlzLnBvc2l0aW9uSW5CdWZmZXIobm9kZSwgcmVtYWluZGVyIC0gMSk7XG5cdFx0XHRcdFx0XHR0aGlzLmRlbGV0ZU5vZGVUYWlsKG5vZGUsIHByZXZpb3VzUG9zKTtcblx0XHRcdFx0XHRcdHZhbHVlID0gJ1xccicgKyB2YWx1ZTtcblxuXHRcdFx0XHRcdFx0aWYgKG5vZGUucGllY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdG5vZGVzVG9EZWwucHVzaChub2RlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWxldGVOb2RlVGFpbChub2RlLCBpbnNlcnRQb3NJbkJ1ZmZlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZGVsZXRlTm9kZVRhaWwobm9kZSwgaW5zZXJ0UG9zSW5CdWZmZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV3UGllY2VzID0gdGhpcy5jcmVhdGVOZXdQaWVjZXModmFsdWUpO1xuXHRcdFx0XHRpZiAobmV3UmlnaHRQaWVjZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yYkluc2VydFJpZ2h0KG5vZGUsIG5ld1JpZ2h0UGllY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHRtcE5vZGUgPSBub2RlO1xuXHRcdFx0XHRmb3IgKGxldCBrID0gMDsgayA8IG5ld1BpZWNlcy5sZW5ndGg7IGsrKykge1xuXHRcdFx0XHRcdHRtcE5vZGUgPSB0aGlzLnJiSW5zZXJ0UmlnaHQodG1wTm9kZSwgbmV3UGllY2VzW2tdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmRlbGV0ZU5vZGVzKG5vZGVzVG9EZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5pbnNlcnRDb250ZW50VG9Ob2RlUmlnaHQodmFsdWUsIG5vZGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBpbnNlcnQgbmV3IG5vZGVcblx0XHRcdGNvbnN0IHBpZWNlcyA9IHRoaXMuY3JlYXRlTmV3UGllY2VzKHZhbHVlKTtcblx0XHRcdGxldCBub2RlID0gdGhpcy5yYkluc2VydExlZnQobnVsbCwgcGllY2VzWzBdKTtcblxuXHRcdFx0Zm9yIChsZXQgayA9IDE7IGsgPCBwaWVjZXMubGVuZ3RoOyBrKyspIHtcblx0XHRcdFx0bm9kZSA9IHRoaXMucmJJbnNlcnRSaWdodChub2RlLCBwaWVjZXNba10pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHRvZG8sIHRoaXMgaXMgdG9vIGJydXRhbC4gVG90YWwgbGluZSBmZWVkIGNvdW50IHNob3VsZCBiZSB1cGRhdGVkIHRoZSBzYW1lIHdheSBhcyBsZl9sZWZ0LlxuXHRcdHRoaXMuY29tcHV0ZUJ1ZmZlck1ldGFkYXRhKCk7XG5cdH1cblxuXHRwdWJsaWMgZGVsZXRlKG9mZnNldDogbnVtYmVyLCBjbnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RWaXNpdGVkTGluZS5saW5lTnVtYmVyID0gMDtcblx0XHR0aGlzLl9sYXN0VmlzaXRlZExpbmUudmFsdWUgPSAnJztcblxuXHRcdGlmIChjbnQgPD0gMCB8fCB0aGlzLnJvb3QgPT09IFNFTlRJTkVMKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IHRoaXMubm9kZUF0KG9mZnNldCk7XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSB0aGlzLm5vZGVBdChvZmZzZXQgKyBjbnQpO1xuXHRcdGNvbnN0IHN0YXJ0Tm9kZSA9IHN0YXJ0UG9zaXRpb24ubm9kZTtcblx0XHRjb25zdCBlbmROb2RlID0gZW5kUG9zaXRpb24ubm9kZTtcblxuXHRcdGlmIChzdGFydE5vZGUgPT09IGVuZE5vZGUpIHtcblx0XHRcdGNvbnN0IHN0YXJ0U3BsaXRQb3NJbkJ1ZmZlciA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihzdGFydE5vZGUsIHN0YXJ0UG9zaXRpb24ucmVtYWluZGVyKTtcblx0XHRcdGNvbnN0IGVuZFNwbGl0UG9zSW5CdWZmZXIgPSB0aGlzLnBvc2l0aW9uSW5CdWZmZXIoc3RhcnROb2RlLCBlbmRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXG5cdFx0XHRpZiAoc3RhcnRQb3NpdGlvbi5ub2RlU3RhcnRPZmZzZXQgPT09IG9mZnNldCkge1xuXHRcdFx0XHRpZiAoY250ID09PSBzdGFydE5vZGUucGllY2UubGVuZ3RoKSB7IC8vIGRlbGV0ZSBub2RlXG5cdFx0XHRcdFx0Y29uc3QgbmV4dCA9IHN0YXJ0Tm9kZS5uZXh0KCk7XG5cdFx0XHRcdFx0cmJEZWxldGUodGhpcywgc3RhcnROb2RlKTtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlQ1JMRldpdGhQcmV2Tm9kZShuZXh0KTtcblx0XHRcdFx0XHR0aGlzLmNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmRlbGV0ZU5vZGVIZWFkKHN0YXJ0Tm9kZSwgZW5kU3BsaXRQb3NJbkJ1ZmZlcik7XG5cdFx0XHRcdHRoaXMuX3NlYXJjaENhY2hlLnZhbGlkYXRlKG9mZnNldCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVDUkxGV2l0aFByZXZOb2RlKHN0YXJ0Tm9kZSk7XG5cdFx0XHRcdHRoaXMuY29tcHV0ZUJ1ZmZlck1ldGFkYXRhKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXJ0UG9zaXRpb24ubm9kZVN0YXJ0T2Zmc2V0ICsgc3RhcnROb2RlLnBpZWNlLmxlbmd0aCA9PT0gb2Zmc2V0ICsgY250KSB7XG5cdFx0XHRcdHRoaXMuZGVsZXRlTm9kZVRhaWwoc3RhcnROb2RlLCBzdGFydFNwbGl0UG9zSW5CdWZmZXIpO1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlQ1JMRldpdGhOZXh0Tm9kZShzdGFydE5vZGUpO1xuXHRcdFx0XHR0aGlzLmNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIGRlbGV0ZSBjb250ZW50IGluIHRoZSBtaWRkbGUsIHRoaXMgbm9kZSB3aWxsIGJlIHNwbGl0dGVkIHRvIG5vZGVzXG5cdFx0XHR0aGlzLnNocmlua05vZGUoc3RhcnROb2RlLCBzdGFydFNwbGl0UG9zSW5CdWZmZXIsIGVuZFNwbGl0UG9zSW5CdWZmZXIpO1xuXHRcdFx0dGhpcy5jb21wdXRlQnVmZmVyTWV0YWRhdGEoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2Rlc1RvRGVsOiBUcmVlTm9kZVtdID0gW107XG5cblx0XHRjb25zdCBzdGFydFNwbGl0UG9zSW5CdWZmZXIgPSB0aGlzLnBvc2l0aW9uSW5CdWZmZXIoc3RhcnROb2RlLCBzdGFydFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cdFx0dGhpcy5kZWxldGVOb2RlVGFpbChzdGFydE5vZGUsIHN0YXJ0U3BsaXRQb3NJbkJ1ZmZlcik7XG5cdFx0dGhpcy5fc2VhcmNoQ2FjaGUudmFsaWRhdGUob2Zmc2V0KTtcblx0XHRpZiAoc3RhcnROb2RlLnBpZWNlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bm9kZXNUb0RlbC5wdXNoKHN0YXJ0Tm9kZSk7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIGxhc3QgdG91Y2hlZCBub2RlXG5cdFx0Y29uc3QgZW5kU3BsaXRQb3NJbkJ1ZmZlciA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihlbmROb2RlLCBlbmRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXHRcdHRoaXMuZGVsZXRlTm9kZUhlYWQoZW5kTm9kZSwgZW5kU3BsaXRQb3NJbkJ1ZmZlcik7XG5cdFx0aWYgKGVuZE5vZGUucGllY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRub2Rlc1RvRGVsLnB1c2goZW5kTm9kZSk7XG5cdFx0fVxuXG5cdFx0Ly8gZGVsZXRlIG5vZGVzIGluIGJldHdlZW5cblx0XHRjb25zdCBzZWNvbmROb2RlID0gc3RhcnROb2RlLm5leHQoKTtcblx0XHRmb3IgKGxldCBub2RlID0gc2Vjb25kTm9kZTsgbm9kZSAhPT0gU0VOVElORUwgJiYgbm9kZSAhPT0gZW5kTm9kZTsgbm9kZSA9IG5vZGUubmV4dCgpKSB7XG5cdFx0XHRub2Rlc1RvRGVsLnB1c2gobm9kZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldiA9IHN0YXJ0Tm9kZS5waWVjZS5sZW5ndGggPT09IDAgPyBzdGFydE5vZGUucHJldigpIDogc3RhcnROb2RlO1xuXHRcdHRoaXMuZGVsZXRlTm9kZXMobm9kZXNUb0RlbCk7XG5cdFx0dGhpcy52YWxpZGF0ZUNSTEZXaXRoTmV4dE5vZGUocHJldik7XG5cdFx0dGhpcy5jb21wdXRlQnVmZmVyTWV0YWRhdGEoKTtcblx0fVxuXG5cdHByaXZhdGUgaW5zZXJ0Q29udGVudFRvTm9kZUxlZnQodmFsdWU6IHN0cmluZywgbm9kZTogVHJlZU5vZGUpIHtcblx0XHQvLyB3ZSBhcmUgaW5zZXJ0aW5nIGNvbnRlbnQgdG8gdGhlIGJlZ2lubmluZyBvZiBub2RlXG5cdFx0Y29uc3Qgbm9kZXNUb0RlbDogVHJlZU5vZGVbXSA9IFtdO1xuXHRcdGlmICh0aGlzLnNob3VsZENoZWNrQ1JMRigpICYmIHRoaXMuZW5kV2l0aENSKHZhbHVlKSAmJiB0aGlzLnN0YXJ0V2l0aExGKG5vZGUpKSB7XG5cdFx0XHQvLyBtb3ZlIGBcXG5gIHRvIG5ldyBub2RlLlxuXG5cdFx0XHRjb25zdCBwaWVjZSA9IG5vZGUucGllY2U7XG5cdFx0XHRjb25zdCBuZXdTdGFydDogQnVmZmVyQ3Vyc29yID0geyBsaW5lOiBwaWVjZS5zdGFydC5saW5lICsgMSwgY29sdW1uOiAwIH07XG5cdFx0XHRjb25zdCBuUGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRcdHBpZWNlLmJ1ZmZlckluZGV4LFxuXHRcdFx0XHRuZXdTdGFydCxcblx0XHRcdFx0cGllY2UuZW5kLFxuXHRcdFx0XHR0aGlzLmdldExpbmVGZWVkQ250KHBpZWNlLmJ1ZmZlckluZGV4LCBuZXdTdGFydCwgcGllY2UuZW5kKSxcblx0XHRcdFx0cGllY2UubGVuZ3RoIC0gMVxuXHRcdFx0KTtcblxuXHRcdFx0bm9kZS5waWVjZSA9IG5QaWVjZTtcblxuXHRcdFx0dmFsdWUgKz0gJ1xcbic7XG5cdFx0XHR1cGRhdGVUcmVlTWV0YWRhdGEodGhpcywgbm9kZSwgLTEsIC0xKTtcblxuXHRcdFx0aWYgKG5vZGUucGllY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdG5vZGVzVG9EZWwucHVzaChub2RlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBuZXdQaWVjZXMgPSB0aGlzLmNyZWF0ZU5ld1BpZWNlcyh2YWx1ZSk7XG5cdFx0bGV0IG5ld05vZGUgPSB0aGlzLnJiSW5zZXJ0TGVmdChub2RlLCBuZXdQaWVjZXNbbmV3UGllY2VzLmxlbmd0aCAtIDFdKTtcblx0XHRmb3IgKGxldCBrID0gbmV3UGllY2VzLmxlbmd0aCAtIDI7IGsgPj0gMDsgay0tKSB7XG5cdFx0XHRuZXdOb2RlID0gdGhpcy5yYkluc2VydExlZnQobmV3Tm9kZSwgbmV3UGllY2VzW2tdKTtcblx0XHR9XG5cdFx0dGhpcy52YWxpZGF0ZUNSTEZXaXRoUHJldk5vZGUobmV3Tm9kZSk7XG5cdFx0dGhpcy5kZWxldGVOb2Rlcyhub2Rlc1RvRGVsKTtcblx0fVxuXG5cdHByaXZhdGUgaW5zZXJ0Q29udGVudFRvTm9kZVJpZ2h0KHZhbHVlOiBzdHJpbmcsIG5vZGU6IFRyZWVOb2RlKSB7XG5cdFx0Ly8gd2UgYXJlIGluc2VydGluZyB0byB0aGUgcmlnaHQgb2YgdGhpcyBub2RlLlxuXHRcdGlmICh0aGlzLmFkanVzdENhcnJpYWdlUmV0dXJuRnJvbU5leHQodmFsdWUsIG5vZGUpKSB7XG5cdFx0XHQvLyBtb3ZlIFxcbiB0byB0aGUgbmV3IG5vZGUuXG5cdFx0XHR2YWx1ZSArPSAnXFxuJztcblx0XHR9XG5cblx0XHRjb25zdCBuZXdQaWVjZXMgPSB0aGlzLmNyZWF0ZU5ld1BpZWNlcyh2YWx1ZSk7XG5cdFx0Y29uc3QgbmV3Tm9kZSA9IHRoaXMucmJJbnNlcnRSaWdodChub2RlLCBuZXdQaWVjZXNbMF0pO1xuXHRcdGxldCB0bXBOb2RlID0gbmV3Tm9kZTtcblxuXHRcdGZvciAobGV0IGsgPSAxOyBrIDwgbmV3UGllY2VzLmxlbmd0aDsgaysrKSB7XG5cdFx0XHR0bXBOb2RlID0gdGhpcy5yYkluc2VydFJpZ2h0KHRtcE5vZGUsIG5ld1BpZWNlc1trXSk7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWxpZGF0ZUNSTEZXaXRoUHJldk5vZGUobmV3Tm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIHBvc2l0aW9uSW5CdWZmZXIobm9kZTogVHJlZU5vZGUsIHJlbWFpbmRlcjogbnVtYmVyKTogQnVmZmVyQ3Vyc29yO1xuXHRwcml2YXRlIHBvc2l0aW9uSW5CdWZmZXIobm9kZTogVHJlZU5vZGUsIHJlbWFpbmRlcjogbnVtYmVyLCByZXQ6IEJ1ZmZlckN1cnNvcik6IG51bGw7XG5cdHByaXZhdGUgcG9zaXRpb25JbkJ1ZmZlcihub2RlOiBUcmVlTm9kZSwgcmVtYWluZGVyOiBudW1iZXIsIHJldD86IEJ1ZmZlckN1cnNvcik6IEJ1ZmZlckN1cnNvciB8IG51bGwge1xuXHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRjb25zdCBidWZmZXJJbmRleCA9IG5vZGUucGllY2UuYnVmZmVySW5kZXg7XG5cdFx0Y29uc3QgbGluZVN0YXJ0cyA9IHRoaXMuX2J1ZmZlcnNbYnVmZmVySW5kZXhdLmxpbmVTdGFydHM7XG5cblx0XHRjb25zdCBzdGFydE9mZnNldCA9IGxpbmVTdGFydHNbcGllY2Uuc3RhcnQubGluZV0gKyBwaWVjZS5zdGFydC5jb2x1bW47XG5cblx0XHRjb25zdCBvZmZzZXQgPSBzdGFydE9mZnNldCArIHJlbWFpbmRlcjtcblxuXHRcdC8vIGJpbmFyeSBzZWFyY2ggb2Zmc2V0IGJldHdlZW4gc3RhcnRPZmZzZXQgYW5kIGVuZE9mZnNldFxuXHRcdGxldCBsb3cgPSBwaWVjZS5zdGFydC5saW5lO1xuXHRcdGxldCBoaWdoID0gcGllY2UuZW5kLmxpbmU7XG5cblx0XHRsZXQgbWlkOiBudW1iZXIgPSAwO1xuXHRcdGxldCBtaWRTdG9wOiBudW1iZXIgPSAwO1xuXHRcdGxldCBtaWRTdGFydDogbnVtYmVyID0gMDtcblxuXHRcdHdoaWxlIChsb3cgPD0gaGlnaCkge1xuXHRcdFx0bWlkID0gbG93ICsgKChoaWdoIC0gbG93KSAvIDIpIHwgMDtcblx0XHRcdG1pZFN0YXJ0ID0gbGluZVN0YXJ0c1ttaWRdO1xuXG5cdFx0XHRpZiAobWlkID09PSBoaWdoKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRtaWRTdG9wID0gbGluZVN0YXJ0c1ttaWQgKyAxXTtcblxuXHRcdFx0aWYgKG9mZnNldCA8IG1pZFN0YXJ0KSB7XG5cdFx0XHRcdGhpZ2ggPSBtaWQgLSAxO1xuXHRcdFx0fSBlbHNlIGlmIChvZmZzZXQgPj0gbWlkU3RvcCkge1xuXHRcdFx0XHRsb3cgPSBtaWQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJldCkge1xuXHRcdFx0cmV0LmxpbmUgPSBtaWQ7XG5cdFx0XHRyZXQuY29sdW1uID0gb2Zmc2V0IC0gbWlkU3RhcnQ7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZTogbWlkLFxuXHRcdFx0Y29sdW1uOiBvZmZzZXQgLSBtaWRTdGFydFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldExpbmVGZWVkQ250KGJ1ZmZlckluZGV4OiBudW1iZXIsIHN0YXJ0OiBCdWZmZXJDdXJzb3IsIGVuZDogQnVmZmVyQ3Vyc29yKTogbnVtYmVyIHtcblx0XHQvLyB3ZSBkb24ndCBuZWVkIHRvIHdvcnJ5IGFib3V0IHN0YXJ0OiBhYmNcXHJ8XFxuLCBvciBhYmN8XFxyLCBvciBhYmN8XFxuLCBvciBhYmN8XFxyXFxuIGRvZXNuJ3QgY2hhbmdlIHRoZSBmYWN0IHRoYXQsIHRoZXJlIGlzIG9uZSBsaW5lIGJyZWFrIGFmdGVyIHN0YXJ0LlxuXHRcdC8vIG5vdyBsZXQncyB0YWtlIGNhcmUgb2YgZW5kOiBhYmNcXHJ8XFxuLCBpZiBlbmQgaXMgaW4gYmV0d2VlbiBcXHIgYW5kIFxcbiwgd2UgbmVlZCB0byBhZGQgbGluZSBmZWVkIGNvdW50IGJ5IDFcblx0XHRpZiAoZW5kLmNvbHVtbiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGVuZC5saW5lIC0gc3RhcnQubGluZTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1tidWZmZXJJbmRleF0ubGluZVN0YXJ0cztcblx0XHRpZiAoZW5kLmxpbmUgPT09IGxpbmVTdGFydHMubGVuZ3RoIC0gMSkgeyAvLyBpdCBtZWFucywgdGhlcmUgaXMgbm8gXFxuIGFmdGVyIGVuZCwgb3RoZXJ3aXNlLCB0aGVyZSB3aWxsIGJlIG9uZSBtb3JlIGxpbmVTdGFydC5cblx0XHRcdHJldHVybiBlbmQubGluZSAtIHN0YXJ0LmxpbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dExpbmVTdGFydE9mZnNldCA9IGxpbmVTdGFydHNbZW5kLmxpbmUgKyAxXTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSBsaW5lU3RhcnRzW2VuZC5saW5lXSArIGVuZC5jb2x1bW47XG5cdFx0aWYgKG5leHRMaW5lU3RhcnRPZmZzZXQgPiBlbmRPZmZzZXQgKyAxKSB7IC8vIHRoZXJlIGFyZSBtb3JlIHRoYW4gMSBjaGFyYWN0ZXIgYWZ0ZXIgZW5kLCB3aGljaCBtZWFucyBpdCBjYW4ndCBiZSBcXG5cblx0XHRcdHJldHVybiBlbmQubGluZSAtIHN0YXJ0LmxpbmU7XG5cdFx0fVxuXHRcdC8vIGVuZE9mZnNldCArIDEgPT09IG5leHRMaW5lU3RhcnRPZmZzZXRcblx0XHQvLyBjaGFyYWN0ZXIgYXQgZW5kT2Zmc2V0IGlzIFxcbiwgc28gd2UgY2hlY2sgdGhlIGNoYXJhY3RlciBiZWZvcmUgZmlyc3Rcblx0XHQvLyBpZiBjaGFyYWN0ZXIgYXQgZW5kT2Zmc2V0IGlzIFxcciwgZW5kLmNvbHVtbiBpcyAwIGFuZCB3ZSBjYW4ndCBnZXQgaGVyZS5cblx0XHRjb25zdCBwcmV2aW91c0NoYXJPZmZzZXQgPSBlbmRPZmZzZXQgLSAxOyAvLyBlbmQuY29sdW1uID4gMCBzbyBpdCdzIG9rYXkuXG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1tidWZmZXJJbmRleF0uYnVmZmVyO1xuXG5cdFx0aWYgKGJ1ZmZlci5jaGFyQ29kZUF0KHByZXZpb3VzQ2hhck9mZnNldCkgPT09IDEzKSB7XG5cdFx0XHRyZXR1cm4gZW5kLmxpbmUgLSBzdGFydC5saW5lICsgMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGVuZC5saW5lIC0gc3RhcnQubGluZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9mZnNldEluQnVmZmVyKGJ1ZmZlckluZGV4OiBudW1iZXIsIGN1cnNvcjogQnVmZmVyQ3Vyc29yKTogbnVtYmVyIHtcblx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1tidWZmZXJJbmRleF0ubGluZVN0YXJ0cztcblx0XHRyZXR1cm4gbGluZVN0YXJ0c1tjdXJzb3IubGluZV0gKyBjdXJzb3IuY29sdW1uO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWxldGVOb2Rlcyhub2RlczogVHJlZU5vZGVbXSk6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJiRGVsZXRlKHRoaXMsIG5vZGVzW2ldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5ld1BpZWNlcyh0ZXh0OiBzdHJpbmcpOiBQaWVjZVtdIHtcblx0XHRpZiAodGV4dC5sZW5ndGggPiBBdmVyYWdlQnVmZmVyU2l6ZSkge1xuXHRcdFx0Ly8gdGhlIGNvbnRlbnQgaXMgbGFyZ2UsIG9wZXJhdGlvbnMgbGlrZSBzdWJzdHJpbmcsIGNoYXJDb2RlIGJlY29tZXMgc2xvd1xuXHRcdFx0Ly8gc28gaGVyZSB3ZSBzcGxpdCBpdCBpbnRvIHNtYWxsZXIgY2h1bmtzLCBqdXN0IGxpa2Ugd2hhdCB3ZSBkaWQgZm9yIENSL0xGIG5vcm1hbGl6YXRpb25cblx0XHRcdGNvbnN0IG5ld1BpZWNlczogUGllY2VbXSA9IFtdO1xuXHRcdFx0d2hpbGUgKHRleHQubGVuZ3RoID4gQXZlcmFnZUJ1ZmZlclNpemUpIHtcblx0XHRcdFx0Y29uc3QgbGFzdENoYXIgPSB0ZXh0LmNoYXJDb2RlQXQoQXZlcmFnZUJ1ZmZlclNpemUgLSAxKTtcblx0XHRcdFx0bGV0IHNwbGl0VGV4dDtcblx0XHRcdFx0aWYgKGxhc3RDaGFyID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybiB8fCAobGFzdENoYXIgPj0gMHhEODAwICYmIGxhc3RDaGFyIDw9IDB4REJGRikpIHtcblx0XHRcdFx0XHQvLyBsYXN0IGNoYXJhY3RlciBpcyBcXHIgb3IgYSBoaWdoIHN1cnJvZ2F0ZSA9PiBrZWVwIGl0IGJhY2tcblx0XHRcdFx0XHRzcGxpdFRleHQgPSB0ZXh0LnN1YnN0cmluZygwLCBBdmVyYWdlQnVmZmVyU2l6ZSAtIDEpO1xuXHRcdFx0XHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZyhBdmVyYWdlQnVmZmVyU2l6ZSAtIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGl0VGV4dCA9IHRleHQuc3Vic3RyaW5nKDAsIEF2ZXJhZ2VCdWZmZXJTaXplKTtcblx0XHRcdFx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoQXZlcmFnZUJ1ZmZlclNpemUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGluZVN0YXJ0cyA9IGNyZWF0ZUxpbmVTdGFydHNGYXN0KHNwbGl0VGV4dCk7XG5cdFx0XHRcdG5ld1BpZWNlcy5wdXNoKG5ldyBQaWVjZShcblx0XHRcdFx0XHR0aGlzLl9idWZmZXJzLmxlbmd0aCwgLyogYnVmZmVyIGluZGV4ICovXG5cdFx0XHRcdFx0eyBsaW5lOiAwLCBjb2x1bW46IDAgfSxcblx0XHRcdFx0XHR7IGxpbmU6IGxpbmVTdGFydHMubGVuZ3RoIC0gMSwgY29sdW1uOiBzcGxpdFRleHQubGVuZ3RoIC0gbGluZVN0YXJ0c1tsaW5lU3RhcnRzLmxlbmd0aCAtIDFdIH0sXG5cdFx0XHRcdFx0bGluZVN0YXJ0cy5sZW5ndGggLSAxLFxuXHRcdFx0XHRcdHNwbGl0VGV4dC5sZW5ndGhcblx0XHRcdFx0KSk7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlcnMucHVzaChuZXcgU3RyaW5nQnVmZmVyKHNwbGl0VGV4dCwgbGluZVN0YXJ0cykpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lU3RhcnRzID0gY3JlYXRlTGluZVN0YXJ0c0Zhc3QodGV4dCk7XG5cdFx0XHRuZXdQaWVjZXMucHVzaChuZXcgUGllY2UoXG5cdFx0XHRcdHRoaXMuX2J1ZmZlcnMubGVuZ3RoLCAvKiBidWZmZXIgaW5kZXggKi9cblx0XHRcdFx0eyBsaW5lOiAwLCBjb2x1bW46IDAgfSxcblx0XHRcdFx0eyBsaW5lOiBsaW5lU3RhcnRzLmxlbmd0aCAtIDEsIGNvbHVtbjogdGV4dC5sZW5ndGggLSBsaW5lU3RhcnRzW2xpbmVTdGFydHMubGVuZ3RoIC0gMV0gfSxcblx0XHRcdFx0bGluZVN0YXJ0cy5sZW5ndGggLSAxLFxuXHRcdFx0XHR0ZXh0Lmxlbmd0aFxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9idWZmZXJzLnB1c2gobmV3IFN0cmluZ0J1ZmZlcih0ZXh0LCBsaW5lU3RhcnRzKSk7XG5cblx0XHRcdHJldHVybiBuZXdQaWVjZXM7XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fYnVmZmVyc1swXS5idWZmZXIubGVuZ3RoO1xuXHRcdGNvbnN0IGxpbmVTdGFydHMgPSBjcmVhdGVMaW5lU3RhcnRzRmFzdCh0ZXh0LCBmYWxzZSk7XG5cblx0XHRsZXQgc3RhcnQgPSB0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zO1xuXHRcdGlmICh0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHNbdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzLmxlbmd0aCAtIDFdID09PSBzdGFydE9mZnNldFxuXHRcdFx0JiYgc3RhcnRPZmZzZXQgIT09IDBcblx0XHRcdCYmIHRoaXMuc3RhcnRXaXRoTEYodGV4dClcblx0XHRcdCYmIHRoaXMuZW5kV2l0aENSKHRoaXMuX2J1ZmZlcnNbMF0uYnVmZmVyKSAvLyB0b2RvLCB3ZSBjYW4gY2hlY2sgdGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcydzIGNvbHVtbiBhcyBpdCdzIHRoZSBsYXN0IG9uZVxuXHRcdCkge1xuXHRcdFx0dGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcyA9IHsgbGluZTogdGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcy5saW5lLCBjb2x1bW46IHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3MuY29sdW1uICsgMSB9O1xuXHRcdFx0c3RhcnQgPSB0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVTdGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0bGluZVN0YXJ0c1tpXSArPSBzdGFydE9mZnNldCArIDE7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cyA9ICg8bnVtYmVyW10+dGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzKS5jb25jYXQoPG51bWJlcltdPmxpbmVTdGFydHMuc2xpY2UoMSkpO1xuXHRcdFx0dGhpcy5fYnVmZmVyc1swXS5idWZmZXIgKz0gJ18nICsgdGV4dDtcblx0XHRcdHN0YXJ0T2Zmc2V0ICs9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChzdGFydE9mZnNldCAhPT0gMCkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVTdGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRsaW5lU3RhcnRzW2ldICs9IHN0YXJ0T2Zmc2V0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHMgPSAoPG51bWJlcltdPnRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cykuY29uY2F0KDxudW1iZXJbXT5saW5lU3RhcnRzLnNsaWNlKDEpKTtcblx0XHRcdHRoaXMuX2J1ZmZlcnNbMF0uYnVmZmVyICs9IHRleHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5fYnVmZmVyc1swXS5idWZmZXIubGVuZ3RoO1xuXHRcdGNvbnN0IGVuZEluZGV4ID0gdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzLmxlbmd0aCAtIDE7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gZW5kT2Zmc2V0IC0gdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzW2VuZEluZGV4XTtcblx0XHRjb25zdCBlbmRQb3MgPSB7IGxpbmU6IGVuZEluZGV4LCBjb2x1bW46IGVuZENvbHVtbiB9O1xuXHRcdGNvbnN0IG5ld1BpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0MCwgLyoqIHRvZG9AcGVuZyAqL1xuXHRcdFx0c3RhcnQsXG5cdFx0XHRlbmRQb3MsXG5cdFx0XHR0aGlzLmdldExpbmVGZWVkQ250KDAsIHN0YXJ0LCBlbmRQb3MpLFxuXHRcdFx0ZW5kT2Zmc2V0IC0gc3RhcnRPZmZzZXRcblx0XHQpO1xuXHRcdHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3MgPSBlbmRQb3M7XG5cdFx0cmV0dXJuIFtuZXdQaWVjZV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZXNSYXdDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGVudE9mU3ViVHJlZSh0aGlzLnJvb3QpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVSYXdDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlciwgZW5kT2Zmc2V0OiBudW1iZXIgPSAwKTogc3RyaW5nIHtcblx0XHRsZXQgeCA9IHRoaXMucm9vdDtcblxuXHRcdGxldCByZXQgPSAnJztcblx0XHRjb25zdCBjYWNoZSA9IHRoaXMuX3NlYXJjaENhY2hlLmdldDIobGluZU51bWJlcik7XG5cdFx0aWYgKGNhY2hlKSB7XG5cdFx0XHR4ID0gY2FjaGUubm9kZTtcblx0XHRcdGNvbnN0IHByZXZBY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIGxpbmVOdW1iZXIgLSBjYWNoZS5ub2RlU3RhcnRMaW5lTnVtYmVyIC0gMSk7XG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW3gucGllY2UuYnVmZmVySW5kZXhdLmJ1ZmZlcjtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcih4LnBpZWNlLmJ1ZmZlckluZGV4LCB4LnBpZWNlLnN0YXJ0KTtcblx0XHRcdGlmIChjYWNoZS5ub2RlU3RhcnRMaW5lTnVtYmVyICsgeC5waWVjZS5saW5lRmVlZENudCA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0XHRyZXQgPSBidWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0ICsgcHJldkFjY3VtdWxhdGVkVmFsdWUsIHN0YXJ0T2Zmc2V0ICsgeC5waWVjZS5sZW5ndGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYWNjdW11bGF0ZWRWYWx1ZSA9IHRoaXMuZ2V0QWNjdW11bGF0ZWRWYWx1ZSh4LCBsaW5lTnVtYmVyIC0gY2FjaGUubm9kZVN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdHJldHVybiBidWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0ICsgcHJldkFjY3VtdWxhdGVkVmFsdWUsIHN0YXJ0T2Zmc2V0ICsgYWNjdW11bGF0ZWRWYWx1ZSAtIGVuZE9mZnNldCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBub2RlU3RhcnRPZmZzZXQgPSAwO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0XHRpZiAoeC5sZWZ0ICE9PSBTRU5USU5FTCAmJiB4LmxmX2xlZnQgPj0gbGluZU51bWJlciAtIDEpIHtcblx0XHRcdFx0XHR4ID0geC5sZWZ0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHgubGZfbGVmdCArIHgucGllY2UubGluZUZlZWRDbnQgPiBsaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZBY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIGxpbmVOdW1iZXIgLSB4LmxmX2xlZnQgLSAyKTtcblx0XHRcdFx0XHRjb25zdCBhY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIGxpbmVOdW1iZXIgLSB4LmxmX2xlZnQgLSAxKTtcblx0XHRcdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW3gucGllY2UuYnVmZmVySW5kZXhdLmJ1ZmZlcjtcblx0XHRcdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIoeC5waWVjZS5idWZmZXJJbmRleCwgeC5waWVjZS5zdGFydCk7XG5cdFx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0ICs9IHguc2l6ZV9sZWZ0O1xuXHRcdFx0XHRcdHRoaXMuX3NlYXJjaENhY2hlLnNldCh7XG5cdFx0XHRcdFx0XHRub2RlOiB4LFxuXHRcdFx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRcdFx0bm9kZVN0YXJ0TGluZU51bWJlcjogb3JpZ2luYWxMaW5lTnVtYmVyIC0gKGxpbmVOdW1iZXIgLSAxIC0geC5sZl9sZWZ0KVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQgKyBwcmV2QWNjdW11bGF0ZWRWYWx1ZSwgc3RhcnRPZmZzZXQgKyBhY2N1bXVsYXRlZFZhbHVlIC0gZW5kT2Zmc2V0KTtcblx0XHRcdFx0fSBlbHNlIGlmICh4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250ID09PSBsaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZBY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIGxpbmVOdW1iZXIgLSB4LmxmX2xlZnQgLSAyKTtcblx0XHRcdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW3gucGllY2UuYnVmZmVySW5kZXhdLmJ1ZmZlcjtcblx0XHRcdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIoeC5waWVjZS5idWZmZXJJbmRleCwgeC5waWVjZS5zdGFydCk7XG5cblx0XHRcdFx0XHRyZXQgPSBidWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0ICsgcHJldkFjY3VtdWxhdGVkVmFsdWUsIHN0YXJ0T2Zmc2V0ICsgeC5waWVjZS5sZW5ndGgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXIgLT0geC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudDtcblx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXQgKz0geC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdFx0XHR4ID0geC5yaWdodDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNlYXJjaCBpbiBvcmRlciwgdG8gZmluZCB0aGUgbm9kZSBjb250YWlucyBlbmQgY29sdW1uXG5cdFx0eCA9IHgubmV4dCgpO1xuXHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1t4LnBpZWNlLmJ1ZmZlckluZGV4XS5idWZmZXI7XG5cblx0XHRcdGlmICh4LnBpZWNlLmxpbmVGZWVkQ250ID4gMCkge1xuXHRcdFx0XHRjb25zdCBhY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIDApO1xuXHRcdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIoeC5waWVjZS5idWZmZXJJbmRleCwgeC5waWVjZS5zdGFydCk7XG5cblx0XHRcdFx0cmV0ICs9IGJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIHN0YXJ0T2Zmc2V0ICsgYWNjdW11bGF0ZWRWYWx1ZSAtIGVuZE9mZnNldCk7XG5cdFx0XHRcdHJldHVybiByZXQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIoeC5waWVjZS5idWZmZXJJbmRleCwgeC5waWVjZS5zdGFydCk7XG5cdFx0XHRcdHJldCArPSBidWZmZXIuc3Vic3RyKHN0YXJ0T2Zmc2V0LCB4LnBpZWNlLmxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdHggPSB4Lm5leHQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlQnVmZmVyTWV0YWRhdGEoKSB7XG5cdFx0bGV0IHggPSB0aGlzLnJvb3Q7XG5cblx0XHRsZXQgbGZDbnQgPSAxO1xuXHRcdGxldCBsZW4gPSAwO1xuXG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRsZkNudCArPSB4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250O1xuXHRcdFx0bGVuICs9IHguc2l6ZV9sZWZ0ICsgeC5waWVjZS5sZW5ndGg7XG5cdFx0XHR4ID0geC5yaWdodDtcblx0XHR9XG5cblx0XHR0aGlzLl9saW5lQ250ID0gbGZDbnQ7XG5cdFx0dGhpcy5fbGVuZ3RoID0gbGVuO1xuXHRcdHRoaXMuX3NlYXJjaENhY2hlLnZhbGlkYXRlKHRoaXMuX2xlbmd0aCk7XG5cdH1cblxuXHQvLyAjcmVnaW9uIG5vZGUgb3BlcmF0aW9uc1xuXHRwcml2YXRlIGdldEluZGV4T2Yobm9kZTogVHJlZU5vZGUsIGFjY3VtdWxhdGVkVmFsdWU6IG51bWJlcik6IHsgaW5kZXg6IG51bWJlcjsgcmVtYWluZGVyOiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdGNvbnN0IHBvcyA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihub2RlLCBhY2N1bXVsYXRlZFZhbHVlKTtcblx0XHRjb25zdCBsaW5lQ250ID0gcG9zLmxpbmUgLSBwaWVjZS5zdGFydC5saW5lO1xuXG5cdFx0aWYgKHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLmVuZCkgLSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBwaWVjZS5zdGFydCkgPT09IGFjY3VtdWxhdGVkVmFsdWUpIHtcblx0XHRcdC8vIHdlIGFyZSBjaGVja2luZyB0aGUgZW5kIG9mIHRoaXMgbm9kZSwgc28gYSBDUkxGIGNoZWNrIGlzIG5lY2Vzc2FyeS5cblx0XHRcdGNvbnN0IHJlYWxMaW5lQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChub2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBwaWVjZS5zdGFydCwgcG9zKTtcblx0XHRcdGlmIChyZWFsTGluZUNudCAhPT0gbGluZUNudCkge1xuXHRcdFx0XHQvLyBhaGEgeWVzLCBDUkxGXG5cdFx0XHRcdHJldHVybiB7IGluZGV4OiByZWFsTGluZUNudCwgcmVtYWluZGVyOiAwIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaW5kZXg6IGxpbmVDbnQsIHJlbWFpbmRlcjogcG9zLmNvbHVtbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY2N1bXVsYXRlZFZhbHVlKG5vZGU6IFRyZWVOb2RlLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1twaWVjZS5idWZmZXJJbmRleF0ubGluZVN0YXJ0cztcblx0XHRjb25zdCBleHBlY3RlZExpbmVTdGFydEluZGV4ID0gcGllY2Uuc3RhcnQubGluZSArIGluZGV4ICsgMTtcblx0XHRpZiAoZXhwZWN0ZWRMaW5lU3RhcnRJbmRleCA+IHBpZWNlLmVuZC5saW5lKSB7XG5cdFx0XHRyZXR1cm4gbGluZVN0YXJ0c1twaWVjZS5lbmQubGluZV0gKyBwaWVjZS5lbmQuY29sdW1uIC0gbGluZVN0YXJ0c1twaWVjZS5zdGFydC5saW5lXSAtIHBpZWNlLnN0YXJ0LmNvbHVtbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGxpbmVTdGFydHNbZXhwZWN0ZWRMaW5lU3RhcnRJbmRleF0gLSBsaW5lU3RhcnRzW3BpZWNlLnN0YXJ0LmxpbmVdIC0gcGllY2Uuc3RhcnQuY29sdW1uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGVsZXRlTm9kZVRhaWwobm9kZTogVHJlZU5vZGUsIHBvczogQnVmZmVyQ3Vyc29yKSB7XG5cdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdGNvbnN0IG9yaWdpbmFsTEZDbnQgPSBwaWVjZS5saW5lRmVlZENudDtcblx0XHRjb25zdCBvcmlnaW5hbEVuZE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLmVuZCk7XG5cblx0XHRjb25zdCBuZXdFbmQgPSBwb3M7XG5cdFx0Y29uc3QgbmV3RW5kT2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgbmV3RW5kKTtcblx0XHRjb25zdCBuZXdMaW5lRmVlZENudCA9IHRoaXMuZ2V0TGluZUZlZWRDbnQocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLnN0YXJ0LCBuZXdFbmQpO1xuXG5cdFx0Y29uc3QgbGZfZGVsdGEgPSBuZXdMaW5lRmVlZENudCAtIG9yaWdpbmFsTEZDbnQ7XG5cdFx0Y29uc3Qgc2l6ZV9kZWx0YSA9IG5ld0VuZE9mZnNldCAtIG9yaWdpbmFsRW5kT2Zmc2V0O1xuXHRcdGNvbnN0IG5ld0xlbmd0aCA9IHBpZWNlLmxlbmd0aCArIHNpemVfZGVsdGE7XG5cblx0XHRub2RlLnBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0cGllY2UuYnVmZmVySW5kZXgsXG5cdFx0XHRwaWVjZS5zdGFydCxcblx0XHRcdG5ld0VuZCxcblx0XHRcdG5ld0xpbmVGZWVkQ250LFxuXHRcdFx0bmV3TGVuZ3RoXG5cdFx0KTtcblxuXHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBub2RlLCBzaXplX2RlbHRhLCBsZl9kZWx0YSk7XG5cdH1cblxuXHRwcml2YXRlIGRlbGV0ZU5vZGVIZWFkKG5vZGU6IFRyZWVOb2RlLCBwb3M6IEJ1ZmZlckN1cnNvcikge1xuXHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRjb25zdCBvcmlnaW5hbExGQ250ID0gcGllY2UubGluZUZlZWRDbnQ7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLnN0YXJ0KTtcblxuXHRcdGNvbnN0IG5ld1N0YXJ0ID0gcG9zO1xuXHRcdGNvbnN0IG5ld0xpbmVGZWVkQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChwaWVjZS5idWZmZXJJbmRleCwgbmV3U3RhcnQsIHBpZWNlLmVuZCk7XG5cdFx0Y29uc3QgbmV3U3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBuZXdTdGFydCk7XG5cdFx0Y29uc3QgbGZfZGVsdGEgPSBuZXdMaW5lRmVlZENudCAtIG9yaWdpbmFsTEZDbnQ7XG5cdFx0Y29uc3Qgc2l6ZV9kZWx0YSA9IG9yaWdpbmFsU3RhcnRPZmZzZXQgLSBuZXdTdGFydE9mZnNldDtcblx0XHRjb25zdCBuZXdMZW5ndGggPSBwaWVjZS5sZW5ndGggKyBzaXplX2RlbHRhO1xuXHRcdG5vZGUucGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRwaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdG5ld1N0YXJ0LFxuXHRcdFx0cGllY2UuZW5kLFxuXHRcdFx0bmV3TGluZUZlZWRDbnQsXG5cdFx0XHRuZXdMZW5ndGhcblx0XHQpO1xuXG5cdFx0dXBkYXRlVHJlZU1ldGFkYXRhKHRoaXMsIG5vZGUsIHNpemVfZGVsdGEsIGxmX2RlbHRhKTtcblx0fVxuXG5cdHByaXZhdGUgc2hyaW5rTm9kZShub2RlOiBUcmVlTm9kZSwgc3RhcnQ6IEJ1ZmZlckN1cnNvciwgZW5kOiBCdWZmZXJDdXJzb3IpIHtcblx0XHRjb25zdCBwaWVjZSA9IG5vZGUucGllY2U7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTdGFydFBvcyA9IHBpZWNlLnN0YXJ0O1xuXHRcdGNvbnN0IG9yaWdpbmFsRW5kUG9zID0gcGllY2UuZW5kO1xuXG5cdFx0Ly8gb2xkIHBpZWNlLCBvcmlnaW5hbFN0YXJ0UG9zLCBzdGFydFxuXHRcdGNvbnN0IG9sZExlbmd0aCA9IHBpZWNlLmxlbmd0aDtcblx0XHRjb25zdCBvbGRMRkNudCA9IHBpZWNlLmxpbmVGZWVkQ250O1xuXHRcdGNvbnN0IG5ld0VuZCA9IHN0YXJ0O1xuXHRcdGNvbnN0IG5ld0xpbmVGZWVkQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChwaWVjZS5idWZmZXJJbmRleCwgcGllY2Uuc3RhcnQsIG5ld0VuZCk7XG5cdFx0Y29uc3QgbmV3TGVuZ3RoID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgc3RhcnQpIC0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgb3JpZ2luYWxTdGFydFBvcyk7XG5cblx0XHRub2RlLnBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0cGllY2UuYnVmZmVySW5kZXgsXG5cdFx0XHRwaWVjZS5zdGFydCxcblx0XHRcdG5ld0VuZCxcblx0XHRcdG5ld0xpbmVGZWVkQ250LFxuXHRcdFx0bmV3TGVuZ3RoXG5cdFx0KTtcblxuXHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBub2RlLCBuZXdMZW5ndGggLSBvbGRMZW5ndGgsIG5ld0xpbmVGZWVkQ250IC0gb2xkTEZDbnQpO1xuXG5cdFx0Ly8gbmV3IHJpZ2h0IHBpZWNlLCBlbmQsIG9yaWdpbmFsRW5kUG9zXG5cdFx0Y29uc3QgbmV3UGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRwaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdGVuZCxcblx0XHRcdG9yaWdpbmFsRW5kUG9zLFxuXHRcdFx0dGhpcy5nZXRMaW5lRmVlZENudChwaWVjZS5idWZmZXJJbmRleCwgZW5kLCBvcmlnaW5hbEVuZFBvcyksXG5cdFx0XHR0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBvcmlnaW5hbEVuZFBvcykgLSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBlbmQpXG5cdFx0KTtcblxuXHRcdGNvbnN0IG5ld05vZGUgPSB0aGlzLnJiSW5zZXJ0UmlnaHQobm9kZSwgbmV3UGllY2UpO1xuXHRcdHRoaXMudmFsaWRhdGVDUkxGV2l0aFByZXZOb2RlKG5ld05vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRUb05vZGUobm9kZTogVHJlZU5vZGUsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hZGp1c3RDYXJyaWFnZVJldHVybkZyb21OZXh0KHZhbHVlLCBub2RlKSkge1xuXHRcdFx0dmFsdWUgKz0gJ1xcbic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGl0Q1JMRiA9IHRoaXMuc2hvdWxkQ2hlY2tDUkxGKCkgJiYgdGhpcy5zdGFydFdpdGhMRih2YWx1ZSkgJiYgdGhpcy5lbmRXaXRoQ1Iobm9kZSk7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXJzWzBdLmJ1ZmZlci5sZW5ndGg7XG5cdFx0dGhpcy5fYnVmZmVyc1swXS5idWZmZXIgKz0gdmFsdWU7XG5cdFx0Y29uc3QgbGluZVN0YXJ0cyA9IGNyZWF0ZUxpbmVTdGFydHNGYXN0KHZhbHVlLCBmYWxzZSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lU3RhcnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRsaW5lU3RhcnRzW2ldICs9IHN0YXJ0T2Zmc2V0O1xuXHRcdH1cblx0XHRpZiAoaGl0Q1JMRikge1xuXHRcdFx0Y29uc3QgcHJldlN0YXJ0T2Zmc2V0ID0gdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzW3RoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cy5sZW5ndGggLSAyXTtcblx0XHRcdCg8bnVtYmVyW10+dGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzKS5wb3AoKTtcblx0XHRcdC8vIF9sYXN0Q2hhbmdlQnVmZmVyUG9zIGlzIGFscmVhZHkgd3Jvbmdcblx0XHRcdHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3MgPSB7IGxpbmU6IHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3MubGluZSAtIDEsIGNvbHVtbjogc3RhcnRPZmZzZXQgLSBwcmV2U3RhcnRPZmZzZXQgfTtcblx0XHR9XG5cblx0XHR0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHMgPSAoPG51bWJlcltdPnRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cykuY29uY2F0KDxudW1iZXJbXT5saW5lU3RhcnRzLnNsaWNlKDEpKTtcblx0XHRjb25zdCBlbmRJbmRleCA9IHRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cy5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IHRoaXMuX2J1ZmZlcnNbMF0uYnVmZmVyLmxlbmd0aCAtIHRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0c1tlbmRJbmRleF07XG5cdFx0Y29uc3QgbmV3RW5kID0geyBsaW5lOiBlbmRJbmRleCwgY29sdW1uOiBlbmRDb2x1bW4gfTtcblx0XHRjb25zdCBuZXdMZW5ndGggPSBub2RlLnBpZWNlLmxlbmd0aCArIHZhbHVlLmxlbmd0aDtcblx0XHRjb25zdCBvbGRMaW5lRmVlZENudCA9IG5vZGUucGllY2UubGluZUZlZWRDbnQ7XG5cdFx0Y29uc3QgbmV3TGluZUZlZWRDbnQgPSB0aGlzLmdldExpbmVGZWVkQ250KDAsIG5vZGUucGllY2Uuc3RhcnQsIG5ld0VuZCk7XG5cdFx0Y29uc3QgbGZfZGVsdGEgPSBuZXdMaW5lRmVlZENudCAtIG9sZExpbmVGZWVkQ250O1xuXG5cdFx0bm9kZS5waWVjZSA9IG5ldyBQaWVjZShcblx0XHRcdG5vZGUucGllY2UuYnVmZmVySW5kZXgsXG5cdFx0XHRub2RlLnBpZWNlLnN0YXJ0LFxuXHRcdFx0bmV3RW5kLFxuXHRcdFx0bmV3TGluZUZlZWRDbnQsXG5cdFx0XHRuZXdMZW5ndGhcblx0XHQpO1xuXG5cdFx0dGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcyA9IG5ld0VuZDtcblx0XHR1cGRhdGVUcmVlTWV0YWRhdGEodGhpcywgbm9kZSwgdmFsdWUubGVuZ3RoLCBsZl9kZWx0YSk7XG5cdH1cblxuXHRwcml2YXRlIG5vZGVBdChvZmZzZXQ6IG51bWJlcik6IE5vZGVQb3NpdGlvbiB7XG5cdFx0bGV0IHggPSB0aGlzLnJvb3Q7XG5cdFx0Y29uc3QgY2FjaGUgPSB0aGlzLl9zZWFyY2hDYWNoZS5nZXQob2Zmc2V0KTtcblx0XHRpZiAoY2FjaGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG5vZGU6IGNhY2hlLm5vZGUsXG5cdFx0XHRcdG5vZGVTdGFydE9mZnNldDogY2FjaGUubm9kZVN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRyZW1haW5kZXI6IG9mZnNldCAtIGNhY2hlLm5vZGVTdGFydE9mZnNldFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRsZXQgbm9kZVN0YXJ0T2Zmc2V0ID0gMDtcblxuXHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0aWYgKHguc2l6ZV9sZWZ0ID4gb2Zmc2V0KSB7XG5cdFx0XHRcdHggPSB4LmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHguc2l6ZV9sZWZ0ICsgeC5waWVjZS5sZW5ndGggPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdG5vZGVTdGFydE9mZnNldCArPSB4LnNpemVfbGVmdDtcblx0XHRcdFx0Y29uc3QgcmV0ID0ge1xuXHRcdFx0XHRcdG5vZGU6IHgsXG5cdFx0XHRcdFx0cmVtYWluZGVyOiBvZmZzZXQgLSB4LnNpemVfbGVmdCxcblx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXRcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fc2VhcmNoQ2FjaGUuc2V0KHJldCk7XG5cdFx0XHRcdHJldHVybiByZXQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvZmZzZXQgLT0geC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0ICs9IHguc2l6ZV9sZWZ0ICsgeC5waWVjZS5sZW5ndGg7XG5cdFx0XHRcdHggPSB4LnJpZ2h0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsITtcblx0fVxuXG5cdHByaXZhdGUgbm9kZUF0MihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogTm9kZVBvc2l0aW9uIHtcblx0XHRsZXQgeCA9IHRoaXMucm9vdDtcblx0XHRsZXQgbm9kZVN0YXJ0T2Zmc2V0ID0gMDtcblxuXHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0aWYgKHgubGVmdCAhPT0gU0VOVElORUwgJiYgeC5sZl9sZWZ0ID49IGxpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHRcdHggPSB4LmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHgubGZfbGVmdCArIHgucGllY2UubGluZUZlZWRDbnQgPiBsaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRjb25zdCBwcmV2QWNjdW11YWx0ZWRWYWx1ZSA9IHRoaXMuZ2V0QWNjdW11bGF0ZWRWYWx1ZSh4LCBsaW5lTnVtYmVyIC0geC5sZl9sZWZ0IC0gMik7XG5cdFx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIHgubGZfbGVmdCAtIDEpO1xuXHRcdFx0XHRub2RlU3RhcnRPZmZzZXQgKz0geC5zaXplX2xlZnQ7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRub2RlOiB4LFxuXHRcdFx0XHRcdHJlbWFpbmRlcjogTWF0aC5taW4ocHJldkFjY3VtdWFsdGVkVmFsdWUgKyBjb2x1bW4gLSAxLCBhY2N1bXVsYXRlZFZhbHVlKSxcblx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXRcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoeC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudCA9PT0gbGluZU51bWJlciAtIDEpIHtcblx0XHRcdFx0Y29uc3QgcHJldkFjY3VtdWFsdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIHgubGZfbGVmdCAtIDIpO1xuXHRcdFx0XHRpZiAocHJldkFjY3VtdWFsdGVkVmFsdWUgKyBjb2x1bW4gLSAxIDw9IHgucGllY2UubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG5vZGU6IHgsXG5cdFx0XHRcdFx0XHRyZW1haW5kZXI6IHByZXZBY2N1bXVhbHRlZFZhbHVlICsgY29sdW1uIC0gMSxcblx0XHRcdFx0XHRcdG5vZGVTdGFydE9mZnNldFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29sdW1uIC09IHgucGllY2UubGVuZ3RoIC0gcHJldkFjY3VtdWFsdGVkVmFsdWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVOdW1iZXIgLT0geC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudDtcblx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0ICs9IHguc2l6ZV9sZWZ0ICsgeC5waWVjZS5sZW5ndGg7XG5cdFx0XHRcdHggPSB4LnJpZ2h0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNlYXJjaCBpbiBvcmRlciwgdG8gZmluZCB0aGUgbm9kZSBjb250YWlucyBwb3NpdGlvbi5jb2x1bW5cblx0XHR4ID0geC5uZXh0KCk7XG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cblx0XHRcdGlmICh4LnBpZWNlLmxpbmVGZWVkQ250ID4gMCkge1xuXHRcdFx0XHRjb25zdCBhY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIDApO1xuXHRcdFx0XHRjb25zdCBub2RlU3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldE9mTm9kZSh4KTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRub2RlOiB4LFxuXHRcdFx0XHRcdHJlbWFpbmRlcjogTWF0aC5taW4oY29sdW1uIC0gMSwgYWNjdW11bGF0ZWRWYWx1ZSksXG5cdFx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0XG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoeC5waWVjZS5sZW5ndGggPj0gY29sdW1uIC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IG5vZGVTdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0T2ZOb2RlKHgpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRub2RlOiB4LFxuXHRcdFx0XHRcdFx0cmVtYWluZGVyOiBjb2x1bW4gLSAxLFxuXHRcdFx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb2x1bW4gLT0geC5waWVjZS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0eCA9IHgubmV4dCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsITtcblx0fVxuXG5cdHByaXZhdGUgbm9kZUNoYXJDb2RlQXQobm9kZTogVHJlZU5vZGUsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAobm9kZS5waWVjZS5saW5lRmVlZENudCA8IDEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1tub2RlLnBpZWNlLmJ1ZmZlckluZGV4XTtcblx0XHRjb25zdCBuZXdPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKG5vZGUucGllY2UuYnVmZmVySW5kZXgsIG5vZGUucGllY2Uuc3RhcnQpICsgb2Zmc2V0O1xuXHRcdHJldHVybiBidWZmZXIuYnVmZmVyLmNoYXJDb2RlQXQobmV3T2Zmc2V0KTtcblx0fVxuXG5cdHByaXZhdGUgb2Zmc2V0T2ZOb2RlKG5vZGU6IFRyZWVOb2RlKTogbnVtYmVyIHtcblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRsZXQgcG9zID0gbm9kZS5zaXplX2xlZnQ7XG5cdFx0d2hpbGUgKG5vZGUgIT09IHRoaXMucm9vdCkge1xuXHRcdFx0aWYgKG5vZGUucGFyZW50LnJpZ2h0ID09PSBub2RlKSB7XG5cdFx0XHRcdHBvcyArPSBub2RlLnBhcmVudC5zaXplX2xlZnQgKyBub2RlLnBhcmVudC5waWVjZS5sZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcG9zO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQ1JMRlxuXHRwcml2YXRlIHNob3VsZENoZWNrQ1JMRigpIHtcblx0XHRyZXR1cm4gISh0aGlzLl9FT0xOb3JtYWxpemVkICYmIHRoaXMuX0VPTCA9PT0gJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGFydFdpdGhMRih2YWw6IHN0cmluZyB8IFRyZWVOb2RlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdmFsLmNoYXJDb2RlQXQoMCkgPT09IDEwO1xuXHRcdH1cblxuXHRcdGlmICh2YWwgPT09IFNFTlRJTkVMIHx8IHZhbC5waWVjZS5saW5lRmVlZENudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpZWNlID0gdmFsLnBpZWNlO1xuXHRcdGNvbnN0IGxpbmVTdGFydHMgPSB0aGlzLl9idWZmZXJzW3BpZWNlLmJ1ZmZlckluZGV4XS5saW5lU3RhcnRzO1xuXHRcdGNvbnN0IGxpbmUgPSBwaWVjZS5zdGFydC5saW5lO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gbGluZVN0YXJ0c1tsaW5lXSArIHBpZWNlLnN0YXJ0LmNvbHVtbjtcblx0XHRpZiAobGluZSA9PT0gbGluZVN0YXJ0cy5sZW5ndGggLSAxKSB7XG5cdFx0XHQvLyBsYXN0IGxpbmUsIHNvIHRoZXJlIGlzIG5vIGxpbmUgZmVlZCBhdCB0aGUgZW5kIG9mIHRoaXMgbGluZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0TGluZU9mZnNldCA9IGxpbmVTdGFydHNbbGluZSArIDFdO1xuXHRcdGlmIChuZXh0TGluZU9mZnNldCA+IHN0YXJ0T2Zmc2V0ICsgMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyc1twaWVjZS5idWZmZXJJbmRleF0uYnVmZmVyLmNoYXJDb2RlQXQoc3RhcnRPZmZzZXQpID09PSAxMDtcblx0fVxuXG5cdHByaXZhdGUgZW5kV2l0aENSKHZhbDogc3RyaW5nIHwgVHJlZU5vZGUpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB2YWwuY2hhckNvZGVBdCh2YWwubGVuZ3RoIC0gMSkgPT09IDEzO1xuXHRcdH1cblxuXHRcdGlmICh2YWwgPT09IFNFTlRJTkVMIHx8IHZhbC5waWVjZS5saW5lRmVlZENudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm5vZGVDaGFyQ29kZUF0KHZhbCwgdmFsLnBpZWNlLmxlbmd0aCAtIDEpID09PSAxMztcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVDUkxGV2l0aFByZXZOb2RlKG5leHROb2RlOiBUcmVlTm9kZSkge1xuXHRcdGlmICh0aGlzLnNob3VsZENoZWNrQ1JMRigpICYmIHRoaXMuc3RhcnRXaXRoTEYobmV4dE5vZGUpKSB7XG5cdFx0XHRjb25zdCBub2RlID0gbmV4dE5vZGUucHJldigpO1xuXHRcdFx0aWYgKHRoaXMuZW5kV2l0aENSKG5vZGUpKSB7XG5cdFx0XHRcdHRoaXMuZml4Q1JMRihub2RlLCBuZXh0Tm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUNSTEZXaXRoTmV4dE5vZGUobm9kZTogVHJlZU5vZGUpIHtcblx0XHRpZiAodGhpcy5zaG91bGRDaGVja0NSTEYoKSAmJiB0aGlzLmVuZFdpdGhDUihub2RlKSkge1xuXHRcdFx0Y29uc3QgbmV4dE5vZGUgPSBub2RlLm5leHQoKTtcblx0XHRcdGlmICh0aGlzLnN0YXJ0V2l0aExGKG5leHROb2RlKSkge1xuXHRcdFx0XHR0aGlzLmZpeENSTEYobm9kZSwgbmV4dE5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZml4Q1JMRihwcmV2OiBUcmVlTm9kZSwgbmV4dDogVHJlZU5vZGUpIHtcblx0XHRjb25zdCBub2Rlc1RvRGVsOiBUcmVlTm9kZVtdID0gW107XG5cdFx0Ly8gdXBkYXRlIG5vZGVcblx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1twcmV2LnBpZWNlLmJ1ZmZlckluZGV4XS5saW5lU3RhcnRzO1xuXHRcdGxldCBuZXdFbmQ6IEJ1ZmZlckN1cnNvcjtcblx0XHRpZiAocHJldi5waWVjZS5lbmQuY29sdW1uID09PSAwKSB7XG5cdFx0XHQvLyBpdCBtZWFucywgbGFzdCBsaW5lIGVuZHMgd2l0aCBcXHIsIG5vdCBcXHJcXG5cblx0XHRcdG5ld0VuZCA9IHsgbGluZTogcHJldi5waWVjZS5lbmQubGluZSAtIDEsIGNvbHVtbjogbGluZVN0YXJ0c1twcmV2LnBpZWNlLmVuZC5saW5lXSAtIGxpbmVTdGFydHNbcHJldi5waWVjZS5lbmQubGluZSAtIDFdIC0gMSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBcXHJcXG5cblx0XHRcdG5ld0VuZCA9IHsgbGluZTogcHJldi5waWVjZS5lbmQubGluZSwgY29sdW1uOiBwcmV2LnBpZWNlLmVuZC5jb2x1bW4gLSAxIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldk5ld0xlbmd0aCA9IHByZXYucGllY2UubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBwcmV2TmV3TEZDbnQgPSBwcmV2LnBpZWNlLmxpbmVGZWVkQ250IC0gMTtcblx0XHRwcmV2LnBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0cHJldi5waWVjZS5idWZmZXJJbmRleCxcblx0XHRcdHByZXYucGllY2Uuc3RhcnQsXG5cdFx0XHRuZXdFbmQsXG5cdFx0XHRwcmV2TmV3TEZDbnQsXG5cdFx0XHRwcmV2TmV3TGVuZ3RoXG5cdFx0KTtcblxuXHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBwcmV2LCAtMSwgLTEpO1xuXHRcdGlmIChwcmV2LnBpZWNlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bm9kZXNUb0RlbC5wdXNoKHByZXYpO1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBuZXh0Tm9kZVxuXHRcdGNvbnN0IG5ld1N0YXJ0OiBCdWZmZXJDdXJzb3IgPSB7IGxpbmU6IG5leHQucGllY2Uuc3RhcnQubGluZSArIDEsIGNvbHVtbjogMCB9O1xuXHRcdGNvbnN0IG5ld0xlbmd0aCA9IG5leHQucGllY2UubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBuZXdMaW5lRmVlZENudCA9IHRoaXMuZ2V0TGluZUZlZWRDbnQobmV4dC5waWVjZS5idWZmZXJJbmRleCwgbmV3U3RhcnQsIG5leHQucGllY2UuZW5kKTtcblx0XHRuZXh0LnBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0bmV4dC5waWVjZS5idWZmZXJJbmRleCxcblx0XHRcdG5ld1N0YXJ0LFxuXHRcdFx0bmV4dC5waWVjZS5lbmQsXG5cdFx0XHRuZXdMaW5lRmVlZENudCxcblx0XHRcdG5ld0xlbmd0aFxuXHRcdCk7XG5cblx0XHR1cGRhdGVUcmVlTWV0YWRhdGEodGhpcywgbmV4dCwgLTEsIC0xKTtcblx0XHRpZiAobmV4dC5waWVjZS5sZW5ndGggPT09IDApIHtcblx0XHRcdG5vZGVzVG9EZWwucHVzaChuZXh0KTtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgbmV3IHBpZWNlIHdoaWNoIGNvbnRhaW5zIFxcclxcblxuXHRcdGNvbnN0IHBpZWNlcyA9IHRoaXMuY3JlYXRlTmV3UGllY2VzKCdcXHJcXG4nKTtcblx0XHR0aGlzLnJiSW5zZXJ0UmlnaHQocHJldiwgcGllY2VzWzBdKTtcblx0XHQvLyBkZWxldGUgZW1wdHkgbm9kZXNcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXNUb0RlbC5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmJEZWxldGUodGhpcywgbm9kZXNUb0RlbFtpXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGp1c3RDYXJyaWFnZVJldHVybkZyb21OZXh0KHZhbHVlOiBzdHJpbmcsIG5vZGU6IFRyZWVOb2RlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkQ2hlY2tDUkxGKCkgJiYgdGhpcy5lbmRXaXRoQ1IodmFsdWUpKSB7XG5cdFx0XHRjb25zdCBuZXh0Tm9kZSA9IG5vZGUubmV4dCgpO1xuXHRcdFx0aWYgKHRoaXMuc3RhcnRXaXRoTEYobmV4dE5vZGUpKSB7XG5cdFx0XHRcdC8vIG1vdmUgYFxcbmAgZm9yd2FyZFxuXHRcdFx0XHR2YWx1ZSArPSAnXFxuJztcblxuXHRcdFx0XHRpZiAobmV4dE5vZGUucGllY2UubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0cmJEZWxldGUodGhpcywgbmV4dE5vZGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdFx0Y29uc3QgcGllY2UgPSBuZXh0Tm9kZS5waWVjZTtcblx0XHRcdFx0XHRjb25zdCBuZXdTdGFydDogQnVmZmVyQ3Vyc29yID0geyBsaW5lOiBwaWVjZS5zdGFydC5saW5lICsgMSwgY29sdW1uOiAwIH07XG5cdFx0XHRcdFx0Y29uc3QgbmV3TGVuZ3RoID0gcGllY2UubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRjb25zdCBuZXdMaW5lRmVlZENudCA9IHRoaXMuZ2V0TGluZUZlZWRDbnQocGllY2UuYnVmZmVySW5kZXgsIG5ld1N0YXJ0LCBwaWVjZS5lbmQpO1xuXHRcdFx0XHRcdG5leHROb2RlLnBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0XHRcdFx0cGllY2UuYnVmZmVySW5kZXgsXG5cdFx0XHRcdFx0XHRuZXdTdGFydCxcblx0XHRcdFx0XHRcdHBpZWNlLmVuZCxcblx0XHRcdFx0XHRcdG5ld0xpbmVGZWVkQ250LFxuXHRcdFx0XHRcdFx0bmV3TGVuZ3RoXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBuZXh0Tm9kZSwgLTEsIC0xKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gVHJlZSBvcGVyYXRpb25zXG5cdGl0ZXJhdGUobm9kZTogVHJlZU5vZGUsIGNhbGxiYWNrOiAobm9kZTogVHJlZU5vZGUpID0+IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAobm9kZSA9PT0gU0VOVElORUwpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhTRU5USU5FTCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGVmdFJldCA9IHRoaXMuaXRlcmF0ZShub2RlLmxlZnQsIGNhbGxiYWNrKTtcblx0XHRpZiAoIWxlZnRSZXQpIHtcblx0XHRcdHJldHVybiBsZWZ0UmV0O1xuXHRcdH1cblxuXHRcdHJldHVybiBjYWxsYmFjayhub2RlKSAmJiB0aGlzLml0ZXJhdGUobm9kZS5yaWdodCwgY2FsbGJhY2spO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb2RlQ29udGVudChub2RlOiBUcmVlTm9kZSkge1xuXHRcdGlmIChub2RlID09PSBTRU5USU5FTCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW25vZGUucGllY2UuYnVmZmVySW5kZXhdO1xuXHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLnN0YXJ0KTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBwaWVjZS5lbmQpO1xuXHRcdGNvbnN0IGN1cnJlbnRDb250ZW50ID0gYnVmZmVyLmJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIGVuZE9mZnNldCk7XG5cdFx0cmV0dXJuIGN1cnJlbnRDb250ZW50O1xuXHR9XG5cblx0Z2V0UGllY2VDb250ZW50KHBpZWNlOiBQaWVjZSkge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbcGllY2UuYnVmZmVySW5kZXhdO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgcGllY2Uuc3RhcnQpO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLmVuZCk7XG5cdFx0Y29uc3QgY3VycmVudENvbnRlbnQgPSBidWZmZXIuYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kT2Zmc2V0KTtcblx0XHRyZXR1cm4gY3VycmVudENvbnRlbnQ7XG5cdH1cblxuXHQvKipcblx0ICogICAgICBub2RlICAgICAgICAgICAgICBub2RlXG5cdCAqICAgICAvICBcXCAgICAgICAgICAgICAgLyAgXFxcblx0ICogICAgYSAgIGIgICAgPC0tLS0gICBhICAgIGJcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgL1xuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgIHpcblx0ICovXG5cdHByaXZhdGUgcmJJbnNlcnRSaWdodChub2RlOiBUcmVlTm9kZSB8IG51bGwsIHA6IFBpZWNlKTogVHJlZU5vZGUge1xuXHRcdGNvbnN0IHogPSBuZXcgVHJlZU5vZGUocCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0ei5sZWZ0ID0gU0VOVElORUw7XG5cdFx0ei5yaWdodCA9IFNFTlRJTkVMO1xuXHRcdHoucGFyZW50ID0gU0VOVElORUw7XG5cdFx0ei5zaXplX2xlZnQgPSAwO1xuXHRcdHoubGZfbGVmdCA9IDA7XG5cblx0XHRjb25zdCB4ID0gdGhpcy5yb290O1xuXHRcdGlmICh4ID09PSBTRU5USU5FTCkge1xuXHRcdFx0dGhpcy5yb290ID0gejtcblx0XHRcdHouY29sb3IgPSBOb2RlQ29sb3IuQmxhY2s7XG5cdFx0fSBlbHNlIGlmIChub2RlIS5yaWdodCA9PT0gU0VOVElORUwpIHtcblx0XHRcdG5vZGUhLnJpZ2h0ID0gejtcblx0XHRcdHoucGFyZW50ID0gbm9kZSE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5leHROb2RlID0gbGVmdGVzdChub2RlIS5yaWdodCk7XG5cdFx0XHRuZXh0Tm9kZS5sZWZ0ID0gejtcblx0XHRcdHoucGFyZW50ID0gbmV4dE5vZGU7XG5cdFx0fVxuXG5cdFx0Zml4SW5zZXJ0KHRoaXMsIHopO1xuXHRcdHJldHVybiB6O1xuXHR9XG5cblx0LyoqXG5cdCAqICAgICAgbm9kZSAgICAgICAgICAgICAgbm9kZVxuXHQgKiAgICAgLyAgXFwgICAgICAgICAgICAgIC8gIFxcXG5cdCAqICAgIGEgICBiICAgICAtLS0tPiAgIGEgICAgYlxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgXFxcblx0ICogICAgICAgICAgICAgICAgICAgICAgICB6XG5cdCAqL1xuXHRwcml2YXRlIHJiSW5zZXJ0TGVmdChub2RlOiBUcmVlTm9kZSB8IG51bGwsIHA6IFBpZWNlKTogVHJlZU5vZGUge1xuXHRcdGNvbnN0IHogPSBuZXcgVHJlZU5vZGUocCwgTm9kZUNvbG9yLlJlZCk7XG5cdFx0ei5sZWZ0ID0gU0VOVElORUw7XG5cdFx0ei5yaWdodCA9IFNFTlRJTkVMO1xuXHRcdHoucGFyZW50ID0gU0VOVElORUw7XG5cdFx0ei5zaXplX2xlZnQgPSAwO1xuXHRcdHoubGZfbGVmdCA9IDA7XG5cblx0XHRpZiAodGhpcy5yb290ID09PSBTRU5USU5FTCkge1xuXHRcdFx0dGhpcy5yb290ID0gejtcblx0XHRcdHouY29sb3IgPSBOb2RlQ29sb3IuQmxhY2s7XG5cdFx0fSBlbHNlIGlmIChub2RlIS5sZWZ0ID09PSBTRU5USU5FTCkge1xuXHRcdFx0bm9kZSEubGVmdCA9IHo7XG5cdFx0XHR6LnBhcmVudCA9IG5vZGUhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcmV2Tm9kZSA9IHJpZ2h0dGVzdChub2RlIS5sZWZ0KTsgLy8gYVxuXHRcdFx0cHJldk5vZGUucmlnaHQgPSB6O1xuXHRcdFx0ei5wYXJlbnQgPSBwcmV2Tm9kZTtcblx0XHR9XG5cblx0XHRmaXhJbnNlcnQodGhpcywgeik7XG5cdFx0cmV0dXJuIHo7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRlbnRPZlN1YlRyZWUobm9kZTogVHJlZU5vZGUpOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSAnJztcblxuXHRcdHRoaXMuaXRlcmF0ZShub2RlLCBub2RlID0+IHtcblx0XHRcdHN0ciArPSB0aGlzLmdldE5vZGVDb250ZW50KG5vZGUpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cdC8vICNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUE0QztBQUNyRCxTQUFTLFdBQVcsVUFBVSxVQUFVLFdBQVcsU0FBUyxVQUFVLFdBQVcsMEJBQTBCO0FBQzNHLFNBQVMsVUFBVSxpQkFBaUIsb0JBQW9CO0FBR3hELE1BQU0sb0JBQW9CO0FBRTFCLFNBQVMsZ0JBQWdCLEtBQTBDO0FBQ2xFLE1BQUk7QUFDSixNQUFJLElBQUksSUFBSSxTQUFTLENBQUMsSUFBSSxPQUFPO0FBQ2hDLFFBQUksSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLEVBQy9CLE9BQU87QUFDTixRQUFJLElBQUksWUFBWSxJQUFJLE1BQU07QUFBQSxFQUMvQjtBQUNBLElBQUUsSUFBSSxLQUFLLENBQUM7QUFDWixTQUFPO0FBQ1I7QUFFQSxNQUFNLFdBQVc7QUFBQSxFQUNoQixZQUNpQixZQUNBLElBQ0EsSUFDQSxNQUNBLGNBQ2Y7QUFMZTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUEsRUFDYjtBQUNMO0FBRU8sU0FBUyxxQkFBcUIsS0FBYSxXQUFvQixNQUE0QztBQUNqSCxRQUFNLElBQWMsQ0FBQyxDQUFDO0FBQ3RCLE1BQUksVUFBVTtBQUVkLFdBQVMsSUFBSSxHQUFHLE1BQU0sSUFBSSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQy9DLFVBQU0sTUFBTSxJQUFJLFdBQVcsQ0FBQztBQUU1QixRQUFJLFFBQVEsU0FBUyxnQkFBZ0I7QUFDcEMsVUFBSSxJQUFJLElBQUksT0FBTyxJQUFJLFdBQVcsSUFBSSxDQUFDLE1BQU0sU0FBUyxVQUFVO0FBRS9ELFVBQUUsU0FBUyxJQUFJLElBQUk7QUFDbkI7QUFBQSxNQUNELE9BQU87QUFFTixVQUFFLFNBQVMsSUFBSSxJQUFJO0FBQUEsTUFDcEI7QUFBQSxJQUNELFdBQVcsUUFBUSxTQUFTLFVBQVU7QUFDckMsUUFBRSxTQUFTLElBQUksSUFBSTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNBLE1BQUksVUFBVTtBQUNiLFdBQU8sZ0JBQWdCLENBQUM7QUFBQSxFQUN6QixPQUFPO0FBQ04sV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVPLFNBQVMsaUJBQWlCLEdBQWEsS0FBeUI7QUFDdEUsSUFBRSxTQUFTO0FBQ1gsSUFBRSxDQUFDLElBQUk7QUFDUCxNQUFJLFVBQVU7QUFDZCxNQUFJLEtBQUssR0FBRyxLQUFLLEdBQUcsT0FBTztBQUMzQixNQUFJLGVBQWU7QUFDbkIsV0FBUyxJQUFJLEdBQUcsTUFBTSxJQUFJLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDL0MsVUFBTSxNQUFNLElBQUksV0FBVyxDQUFDO0FBRTVCLFFBQUksUUFBUSxTQUFTLGdCQUFnQjtBQUNwQyxVQUFJLElBQUksSUFBSSxPQUFPLElBQUksV0FBVyxJQUFJLENBQUMsTUFBTSxTQUFTLFVBQVU7QUFFL0Q7QUFDQSxVQUFFLFNBQVMsSUFBSSxJQUFJO0FBQ25CO0FBQUEsTUFDRCxPQUFPO0FBQ047QUFFQSxVQUFFLFNBQVMsSUFBSSxJQUFJO0FBQUEsTUFDcEI7QUFBQSxJQUNELFdBQVcsUUFBUSxTQUFTLFVBQVU7QUFDckM7QUFDQSxRQUFFLFNBQVMsSUFBSSxJQUFJO0FBQUEsSUFDcEIsT0FBTztBQUNOLFVBQUksY0FBYztBQUNqQixZQUFJLFFBQVEsU0FBUyxRQUFRLE1BQU0sTUFBTSxNQUFNLE1BQU07QUFDcEQseUJBQWU7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFFBQU0sU0FBUyxJQUFJLFdBQVcsZ0JBQWdCLENBQUMsR0FBRyxJQUFJLElBQUksTUFBTSxZQUFZO0FBQzVFLElBQUUsU0FBUztBQUVYLFNBQU87QUFDUjtBQTRCTyxNQUFNLE1BQU07QUFBQSxFQU9sQixZQUFZLGFBQXFCLE9BQXFCLEtBQW1CLGFBQXFCLFFBQWdCO0FBQzdHLFNBQUssY0FBYztBQUNuQixTQUFLLFFBQVE7QUFDYixTQUFLLE1BQU07QUFDWCxTQUFLLGNBQWM7QUFDbkIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUNEO0FBRU8sTUFBTSxhQUFhO0FBQUEsRUFJekIsWUFBWSxRQUFnQixZQUFrRDtBQUM3RSxTQUFLLFNBQVM7QUFDZCxTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUNEO0FBUUEsTUFBTSxrQkFBMkM7QUFBQSxFQU1oRCxZQUFZLE1BQXFCLEtBQWE7QUFDN0MsU0FBSyxVQUFVLENBQUM7QUFDaEIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxPQUFPO0FBQ1osU0FBSyxTQUFTO0FBQ2QsUUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixXQUFLLFFBQVEsS0FBSyxNQUFNLFVBQVE7QUFDL0IsWUFBSSxTQUFTLFVBQVU7QUFDdEIsZUFBSyxRQUFRLEtBQUssS0FBSyxLQUFLO0FBQUEsUUFDN0I7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQXNCO0FBQ3JCLFFBQUksS0FBSyxRQUFRLFdBQVcsR0FBRztBQUM5QixVQUFJLEtBQUssV0FBVyxHQUFHO0FBQ3RCLGFBQUs7QUFDTCxlQUFPLEtBQUs7QUFBQSxNQUNiLE9BQU87QUFDTixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssU0FBUyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzFDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixhQUFPLEtBQUssT0FBTyxLQUFLLE1BQU0sZ0JBQWdCLEtBQUssUUFBUSxLQUFLLFFBQVEsQ0FBQztBQUFBLElBQzFFO0FBQ0EsV0FBTyxLQUFLLE1BQU0sZ0JBQWdCLEtBQUssUUFBUSxLQUFLLFFBQVEsQ0FBQztBQUFBLEVBQzlEO0FBQ0Q7QUFRQSxNQUFNLHFCQUFxQjtBQUFBLEVBSTFCLFlBQVksT0FBZTtBQUMxQixTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVMsQ0FBQztBQUFBLEVBQ2hCO0FBQUEsRUFFTyxJQUFJLFFBQW1DO0FBQzdDLGFBQVMsSUFBSSxLQUFLLE9BQU8sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ2pELFlBQU0sVUFBVSxLQUFLLE9BQU8sQ0FBQztBQUM3QixVQUFJLFFBQVEsbUJBQW1CLFVBQVUsUUFBUSxrQkFBa0IsUUFBUSxLQUFLLE1BQU0sVUFBVSxRQUFRO0FBQ3ZHLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxLQUFLLFlBQXFHO0FBQ2hILGFBQVMsSUFBSSxLQUFLLE9BQU8sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ2pELFlBQU0sVUFBVSxLQUFLLE9BQU8sQ0FBQztBQUM3QixVQUFJLFFBQVEsdUJBQXVCLFFBQVEsc0JBQXNCLGNBQWMsUUFBUSxzQkFBc0IsUUFBUSxLQUFLLE1BQU0sZUFBZSxZQUFZO0FBQzFKLGVBQWlGO0FBQUEsTUFDbEY7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLElBQUksY0FBMEI7QUFDcEMsUUFBSSxLQUFLLE9BQU8sVUFBVSxLQUFLLFFBQVE7QUFDdEMsV0FBSyxPQUFPLE1BQU07QUFBQSxJQUNuQjtBQUNBLFNBQUssT0FBTyxLQUFLLFlBQVk7QUFBQSxFQUM5QjtBQUFBLEVBRU8sU0FBUyxRQUFnQjtBQUMvQixRQUFJLGdCQUFnQjtBQUNwQixVQUFNLE1BQWdDLEtBQUs7QUFDM0MsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFFBQVEsS0FBSztBQUNwQyxZQUFNLFVBQVUsSUFBSSxDQUFDO0FBQ3JCLFVBQUksUUFBUSxLQUFLLFdBQVcsUUFBUSxRQUFRLG1CQUFtQixRQUFRO0FBQ3RFLFlBQUksQ0FBQyxJQUFJO0FBQ1Qsd0JBQWdCO0FBQ2hCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLGVBQWU7QUFDbEIsWUFBTSxTQUF1QixDQUFDO0FBQzlCLGlCQUFXLFNBQVMsS0FBSztBQUN4QixZQUFJLFVBQVUsTUFBTTtBQUNuQixpQkFBTyxLQUFLLEtBQUs7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFNBQVM7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSxjQUFjO0FBQUEsRUFZMUIsWUFBWSxRQUF3QixLQUFvQixlQUF3QjtBQUMvRSxTQUFLLE9BQU8sUUFBUSxLQUFLLGFBQWE7QUFBQSxFQUN2QztBQUFBLEVBRUEsT0FBTyxRQUF3QixLQUFvQixlQUF3QjtBQUMxRSxTQUFLLFdBQVc7QUFBQSxNQUNmLElBQUksYUFBYSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDekI7QUFDQSxTQUFLLHVCQUF1QixFQUFFLE1BQU0sR0FBRyxRQUFRLEVBQUU7QUFDakQsU0FBSyxPQUFPO0FBQ1osU0FBSyxXQUFXO0FBQ2hCLFNBQUssVUFBVTtBQUNmLFNBQUssT0FBTztBQUNaLFNBQUssYUFBYSxJQUFJO0FBQ3RCLFNBQUssaUJBQWlCO0FBRXRCLFFBQUksV0FBNEI7QUFDaEMsYUFBUyxJQUFJLEdBQUcsTUFBTSxPQUFPLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbEQsVUFBSSxPQUFPLENBQUMsRUFBRSxPQUFPLFNBQVMsR0FBRztBQUNoQyxZQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWTtBQUMxQixpQkFBTyxDQUFDLEVBQUUsYUFBYSxxQkFBcUIsT0FBTyxDQUFDLEVBQUUsTUFBTTtBQUFBLFFBQzdEO0FBRUEsY0FBTSxRQUFRLElBQUk7QUFBQSxVQUNqQixJQUFJO0FBQUEsVUFDSixFQUFFLE1BQU0sR0FBRyxRQUFRLEVBQUU7QUFBQSxVQUNyQixFQUFFLE1BQU0sT0FBTyxDQUFDLEVBQUUsV0FBVyxTQUFTLEdBQUcsUUFBUSxPQUFPLENBQUMsRUFBRSxPQUFPLFNBQVMsT0FBTyxDQUFDLEVBQUUsV0FBVyxPQUFPLENBQUMsRUFBRSxXQUFXLFNBQVMsQ0FBQyxFQUFFO0FBQUEsVUFDakksT0FBTyxDQUFDLEVBQUUsV0FBVyxTQUFTO0FBQUEsVUFDOUIsT0FBTyxDQUFDLEVBQUUsT0FBTztBQUFBLFFBQ2xCO0FBQ0EsYUFBSyxTQUFTLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDNUIsbUJBQVcsS0FBSyxjQUFjLFVBQVUsS0FBSztBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUVBLFNBQUssZUFBZSxJQUFJLHFCQUFxQixDQUFDO0FBQzlDLFNBQUssbUJBQW1CLEVBQUUsWUFBWSxHQUFHLE9BQU8sR0FBRztBQUNuRCxTQUFLLHNCQUFzQjtBQUFBLEVBQzVCO0FBQUEsRUFFQSxhQUFhLEtBQW9CO0FBQ2hDLFVBQU0sb0JBQW9CO0FBQzFCLFVBQU0sTUFBTSxvQkFBb0IsS0FBSyxNQUFNLG9CQUFvQixDQUFDO0FBQ2hFLFVBQU0sTUFBTSxNQUFNO0FBRWxCLFFBQUksWUFBWTtBQUNoQixRQUFJLGVBQWU7QUFDbkIsVUFBTSxTQUF5QixDQUFDO0FBRWhDLFNBQUssUUFBUSxLQUFLLE1BQU0sVUFBUTtBQUMvQixZQUFNLE1BQU0sS0FBSyxlQUFlLElBQUk7QUFDcEMsWUFBTSxNQUFNLElBQUk7QUFDaEIsVUFBSSxnQkFBZ0IsT0FBTyxlQUFlLE1BQU0sS0FBSztBQUNwRCxxQkFBYTtBQUNiLHdCQUFnQjtBQUNoQixlQUFPO0FBQUEsTUFDUjtBQUdBLFlBQU0sT0FBTyxVQUFVLFFBQVEsZUFBZSxHQUFHO0FBQ2pELGFBQU8sS0FBSyxJQUFJLGFBQWEsTUFBTSxxQkFBcUIsSUFBSSxDQUFDLENBQUM7QUFDOUQsa0JBQVk7QUFDWixxQkFBZTtBQUNmLGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxRQUFJLGVBQWUsR0FBRztBQUNyQixZQUFNLE9BQU8sVUFBVSxRQUFRLGVBQWUsR0FBRztBQUNqRCxhQUFPLEtBQUssSUFBSSxhQUFhLE1BQU0scUJBQXFCLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDL0Q7QUFFQSxTQUFLLE9BQU8sUUFBUSxLQUFLLElBQUk7QUFBQSxFQUM5QjtBQUFBO0FBQUEsRUFHTyxTQUF3QjtBQUM5QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxPQUFPLFFBQTZCO0FBQzFDLFNBQUssT0FBTztBQUNaLFNBQUssYUFBYSxLQUFLLEtBQUs7QUFDNUIsU0FBSyxhQUFhLE1BQU07QUFBQSxFQUN6QjtBQUFBLEVBRU8sZUFBZSxLQUE0QjtBQUNqRCxXQUFPLElBQUksa0JBQWtCLE1BQU0sR0FBRztBQUFBLEVBQ3ZDO0FBQUEsRUFFTyxNQUFNLE9BQStCO0FBQzNDLFFBQUksS0FBSyxVQUFVLE1BQU0sTUFBTSxVQUFVLEdBQUc7QUFDM0MsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssYUFBYSxNQUFNLE1BQU0sYUFBYSxHQUFHO0FBQ2pELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxTQUFTO0FBQ2IsVUFBTSxNQUFNLEtBQUssUUFBUSxLQUFLLE1BQU0sVUFBUTtBQUMzQyxVQUFJLFNBQVMsVUFBVTtBQUN0QixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sTUFBTSxLQUFLLGVBQWUsSUFBSTtBQUNwQyxZQUFNLE1BQU0sSUFBSTtBQUNoQixZQUFNLGdCQUFnQixNQUFNLE9BQU8sTUFBTTtBQUN6QyxZQUFNLGNBQWMsTUFBTSxPQUFPLFNBQVMsR0FBRztBQUM3QyxZQUFNLE1BQU0sTUFBTSxpQkFBaUIsZUFBZSxXQUFXO0FBRTdELGdCQUFVO0FBQ1YsYUFBTyxRQUFRO0FBQUEsSUFDaEIsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxZQUFZLFlBQW9CLFFBQXdCO0FBQzlELFFBQUksVUFBVTtBQUVkLFFBQUksSUFBSSxLQUFLO0FBRWIsV0FBTyxNQUFNLFVBQVU7QUFDdEIsVUFBSSxFQUFFLFNBQVMsWUFBWSxFQUFFLFVBQVUsS0FBSyxZQUFZO0FBQ3ZELFlBQUksRUFBRTtBQUFBLE1BQ1AsV0FBVyxFQUFFLFVBQVUsRUFBRSxNQUFNLGNBQWMsS0FBSyxZQUFZO0FBQzdELG1CQUFXLEVBQUU7QUFFYixjQUFNLCtCQUErQixLQUFLLG9CQUFvQixHQUFHLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFDM0YsZUFBTyxXQUFXLCtCQUErQixTQUFTO0FBQUEsTUFDM0QsT0FBTztBQUNOLHNCQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU07QUFDbEMsbUJBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUNqQyxZQUFJLEVBQUU7QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxjQUFjLFFBQTBCO0FBQzlDLGFBQVMsS0FBSyxNQUFNLE1BQU07QUFDMUIsYUFBUyxLQUFLLElBQUksR0FBRyxNQUFNO0FBRTNCLFFBQUksSUFBSSxLQUFLO0FBQ2IsUUFBSSxRQUFRO0FBQ1osVUFBTSxpQkFBaUI7QUFFdkIsV0FBTyxNQUFNLFVBQVU7QUFDdEIsVUFBSSxFQUFFLGNBQWMsS0FBSyxFQUFFLGFBQWEsUUFBUTtBQUMvQyxZQUFJLEVBQUU7QUFBQSxNQUNQLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxVQUFVLFFBQVE7QUFDbEQsY0FBTSxNQUFNLEtBQUssV0FBVyxHQUFHLFNBQVMsRUFBRSxTQUFTO0FBRW5ELGlCQUFTLEVBQUUsVUFBVSxJQUFJO0FBRXpCLFlBQUksSUFBSSxVQUFVLEdBQUc7QUFDcEIsZ0JBQU0sa0JBQWtCLEtBQUssWUFBWSxRQUFRLEdBQUcsQ0FBQztBQUNyRCxnQkFBTSxTQUFTLGlCQUFpQjtBQUNoQyxpQkFBTyxJQUFJLFNBQVMsUUFBUSxHQUFHLFNBQVMsQ0FBQztBQUFBLFFBQzFDO0FBRUEsZUFBTyxJQUFJLFNBQVMsUUFBUSxHQUFHLElBQUksWUFBWSxDQUFDO0FBQUEsTUFDakQsT0FBTztBQUNOLGtCQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU07QUFDaEMsaUJBQVMsRUFBRSxVQUFVLEVBQUUsTUFBTTtBQUU3QixZQUFJLEVBQUUsVUFBVSxVQUFVO0FBRXpCLGdCQUFNLGtCQUFrQixLQUFLLFlBQVksUUFBUSxHQUFHLENBQUM7QUFDckQsZ0JBQU0sU0FBUyxpQkFBaUIsU0FBUztBQUN6QyxpQkFBTyxJQUFJLFNBQVMsUUFBUSxHQUFHLFNBQVMsQ0FBQztBQUFBLFFBQzFDLE9BQU87QUFDTixjQUFJLEVBQUU7QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxFQUN6QjtBQUFBLEVBRU8sZ0JBQWdCLE9BQWMsS0FBc0I7QUFDMUQsUUFBSSxNQUFNLG9CQUFvQixNQUFNLGlCQUFpQixNQUFNLGdCQUFnQixNQUFNLFdBQVc7QUFDM0YsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixLQUFLLFFBQVEsTUFBTSxpQkFBaUIsTUFBTSxXQUFXO0FBQzNFLFVBQU0sY0FBYyxLQUFLLFFBQVEsTUFBTSxlQUFlLE1BQU0sU0FBUztBQUVyRSxVQUFNLFFBQVEsS0FBSyxpQkFBaUIsZUFBZSxXQUFXO0FBQzlELFFBQUksS0FBSztBQUNSLFVBQUksUUFBUSxLQUFLLFFBQVEsQ0FBQyxLQUFLLGdCQUFnQjtBQUM5QyxlQUFPLE1BQU0sUUFBUSxlQUFlLEdBQUc7QUFBQSxNQUN4QztBQUVBLFVBQUksUUFBUSxLQUFLLE9BQU8sS0FBSyxLQUFLLGdCQUFnQjtBQUNqRCxZQUFJLFFBQVEsUUFBUTtBQUFBLFFBRXBCO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLE1BQU0sUUFBUSxlQUFlLEdBQUc7QUFBQSxJQUN4QztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxpQkFBaUIsZUFBNkIsYUFBbUM7QUFDdkYsUUFBSSxjQUFjLFNBQVMsWUFBWSxNQUFNO0FBQzVDLFlBQU0sT0FBTyxjQUFjO0FBQzNCLFlBQU1BLFVBQVMsS0FBSyxTQUFTLEtBQUssTUFBTSxXQUFXLEVBQUU7QUFDckQsWUFBTUMsZUFBYyxLQUFLLGVBQWUsS0FBSyxNQUFNLGFBQWEsS0FBSyxNQUFNLEtBQUs7QUFDaEYsYUFBT0QsUUFBTyxVQUFVQyxlQUFjLGNBQWMsV0FBV0EsZUFBYyxZQUFZLFNBQVM7QUFBQSxJQUNuRztBQUVBLFFBQUksSUFBSSxjQUFjO0FBQ3RCLFVBQU0sU0FBUyxLQUFLLFNBQVMsRUFBRSxNQUFNLFdBQVcsRUFBRTtBQUNsRCxVQUFNLGNBQWMsS0FBSyxlQUFlLEVBQUUsTUFBTSxhQUFhLEVBQUUsTUFBTSxLQUFLO0FBQzFFLFFBQUksTUFBTSxPQUFPLFVBQVUsY0FBYyxjQUFjLFdBQVcsY0FBYyxFQUFFLE1BQU0sTUFBTTtBQUU5RixRQUFJLEVBQUUsS0FBSztBQUNYLFdBQU8sTUFBTSxVQUFVO0FBQ3RCLFlBQU1ELFVBQVMsS0FBSyxTQUFTLEVBQUUsTUFBTSxXQUFXLEVBQUU7QUFDbEQsWUFBTUMsZUFBYyxLQUFLLGVBQWUsRUFBRSxNQUFNLGFBQWEsRUFBRSxNQUFNLEtBQUs7QUFFMUUsVUFBSSxNQUFNLFlBQVksTUFBTTtBQUMzQixlQUFPRCxRQUFPLFVBQVVDLGNBQWFBLGVBQWMsWUFBWSxTQUFTO0FBQ3hFO0FBQUEsTUFDRCxPQUFPO0FBQ04sZUFBT0QsUUFBTyxPQUFPQyxjQUFhLEVBQUUsTUFBTSxNQUFNO0FBQUEsTUFDakQ7QUFFQSxVQUFJLEVBQUUsS0FBSztBQUFBLElBQ1o7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sa0JBQTRCO0FBQ2xDLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixRQUFJLGNBQWM7QUFDbEIsUUFBSSxjQUFjO0FBQ2xCLFFBQUksYUFBYTtBQUVqQixTQUFLLFFBQVEsS0FBSyxNQUFNLFVBQVE7QUFDL0IsVUFBSSxTQUFTLFVBQVU7QUFDdEIsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLFFBQVEsS0FBSztBQUNuQixVQUFJLGNBQWMsTUFBTTtBQUN4QixVQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxTQUFTLEtBQUssU0FBUyxNQUFNLFdBQVcsRUFBRTtBQUNoRCxZQUFNLGFBQWEsS0FBSyxTQUFTLE1BQU0sV0FBVyxFQUFFO0FBRXBELFlBQU0saUJBQWlCLE1BQU0sTUFBTTtBQUNuQyxZQUFNLGVBQWUsTUFBTSxJQUFJO0FBQy9CLFVBQUksbUJBQW1CLFdBQVcsY0FBYyxJQUFJLE1BQU0sTUFBTTtBQUVoRSxVQUFJLFlBQVk7QUFDZixZQUFJLE9BQU8sV0FBVyxnQkFBZ0IsTUFBTSxTQUFTLFVBQVU7QUFFOUQ7QUFDQTtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGFBQWEsSUFBSTtBQUN2QixzQkFBYztBQUNkLHFCQUFhO0FBQ2IsWUFBSSxnQkFBZ0IsR0FBRztBQUN0QixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBRUEsVUFBSSxtQkFBbUIsY0FBYztBQUVwQyxZQUFJLENBQUMsS0FBSyxrQkFBa0IsT0FBTyxXQUFXLG1CQUFtQixjQUFjLENBQUMsTUFBTSxTQUFTLGdCQUFnQjtBQUM5Ryx1QkFBYTtBQUNiLHlCQUFlLE9BQU8sT0FBTyxrQkFBa0IsY0FBYyxDQUFDO0FBQUEsUUFDL0QsT0FBTztBQUNOLHlCQUFlLE9BQU8sT0FBTyxrQkFBa0IsV0FBVztBQUFBLFFBQzNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFHQSxxQkFDQyxLQUFLLGlCQUNGLE9BQU8sVUFBVSxrQkFBa0IsS0FBSyxJQUFJLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsSUFDL0csT0FBTyxVQUFVLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDLENBQUMsRUFBRSxRQUFRLGlCQUFpQixFQUFFO0FBRWxHLFlBQU0sYUFBYSxJQUFJO0FBRXZCLGVBQVMsT0FBTyxpQkFBaUIsR0FBRyxPQUFPLGNBQWMsUUFBUTtBQUNoRSxzQkFDQyxLQUFLLGlCQUNGLE9BQU8sVUFBVSxXQUFXLElBQUksR0FBRyxXQUFXLE9BQU8sQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUN6RSxPQUFPLFVBQVUsV0FBVyxJQUFJLEdBQUcsV0FBVyxPQUFPLENBQUMsQ0FBQyxFQUFFLFFBQVEsaUJBQWlCLEVBQUU7QUFFeEYsY0FBTSxhQUFhLElBQUk7QUFBQSxNQUN4QjtBQUVBLFVBQUksQ0FBQyxLQUFLLGtCQUFrQixPQUFPLFdBQVcsV0FBVyxZQUFZLElBQUksTUFBTSxJQUFJLFNBQVMsQ0FBQyxNQUFNLFNBQVMsZ0JBQWdCO0FBQzNILHFCQUFhO0FBQ2IsWUFBSSxNQUFNLElBQUksV0FBVyxHQUFHO0FBRTNCO0FBQUEsUUFDRCxPQUFPO0FBQ04sd0JBQWMsT0FBTyxPQUFPLFdBQVcsWUFBWSxHQUFHLE1BQU0sSUFBSSxTQUFTLENBQUM7QUFBQSxRQUMzRTtBQUFBLE1BQ0QsT0FBTztBQUNOLHNCQUFjLE9BQU8sT0FBTyxXQUFXLFlBQVksR0FBRyxNQUFNLElBQUksTUFBTTtBQUFBLE1BQ3ZFO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFFBQUksWUFBWTtBQUNmLFlBQU0sYUFBYSxJQUFJO0FBQ3ZCLG9CQUFjO0FBQUEsSUFDZjtBQUVBLFVBQU0sYUFBYSxJQUFJO0FBQ3ZCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxZQUFvQjtBQUMxQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxlQUF1QjtBQUM3QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxlQUFlLFlBQTRCO0FBQ2pELFFBQUksS0FBSyxpQkFBaUIsZUFBZSxZQUFZO0FBQ3BELGFBQU8sS0FBSyxpQkFBaUI7QUFBQSxJQUM5QjtBQUVBLFNBQUssaUJBQWlCLGFBQWE7QUFFbkMsUUFBSSxlQUFlLEtBQUssVUFBVTtBQUNqQyxXQUFLLGlCQUFpQixRQUFRLEtBQUssa0JBQWtCLFVBQVU7QUFBQSxJQUNoRSxXQUFXLEtBQUssZ0JBQWdCO0FBQy9CLFdBQUssaUJBQWlCLFFBQVEsS0FBSyxrQkFBa0IsWUFBWSxLQUFLLFVBQVU7QUFBQSxJQUNqRixPQUFPO0FBQ04sV0FBSyxpQkFBaUIsUUFBUSxLQUFLLGtCQUFrQixVQUFVLEVBQUUsUUFBUSxpQkFBaUIsRUFBRTtBQUFBLElBQzdGO0FBRUEsV0FBTyxLQUFLLGlCQUFpQjtBQUFBLEVBQzlCO0FBQUEsRUFFUSxhQUFhLFNBQStCO0FBQ25ELFFBQUksUUFBUSxjQUFjLFFBQVEsS0FBSyxNQUFNLFFBQVE7QUFFcEQsWUFBTSxlQUFlLFFBQVEsS0FBSyxLQUFLO0FBQ3ZDLFVBQUksQ0FBQyxjQUFjO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxTQUFTLEtBQUssU0FBUyxhQUFhLE1BQU0sV0FBVztBQUMzRCxZQUFNLGNBQWMsS0FBSyxlQUFlLGFBQWEsTUFBTSxhQUFhLGFBQWEsTUFBTSxLQUFLO0FBQ2hHLGFBQU8sT0FBTyxPQUFPLFdBQVcsV0FBVztBQUFBLElBQzVDLE9BQU87QUFDTixZQUFNLFNBQVMsS0FBSyxTQUFTLFFBQVEsS0FBSyxNQUFNLFdBQVc7QUFDM0QsWUFBTSxjQUFjLEtBQUssZUFBZSxRQUFRLEtBQUssTUFBTSxhQUFhLFFBQVEsS0FBSyxNQUFNLEtBQUs7QUFDaEcsWUFBTSxlQUFlLGNBQWMsUUFBUTtBQUUzQyxhQUFPLE9BQU8sT0FBTyxXQUFXLFlBQVk7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQSxFQUVPLGdCQUFnQixZQUFvQixPQUF1QjtBQUNqRSxVQUFNLFVBQVUsS0FBSyxRQUFRLFlBQVksUUFBUSxDQUFDO0FBQ2xELFdBQU8sS0FBSyxhQUFhLE9BQU87QUFBQSxFQUNqQztBQUFBLEVBRU8sY0FBYyxZQUE0QjtBQUNoRCxRQUFJLGVBQWUsS0FBSyxhQUFhLEdBQUc7QUFDdkMsWUFBTSxjQUFjLEtBQUssWUFBWSxZQUFZLENBQUM7QUFDbEQsYUFBTyxLQUFLLFVBQVUsSUFBSTtBQUFBLElBQzNCO0FBQ0EsV0FBTyxLQUFLLFlBQVksYUFBYSxHQUFHLENBQUMsSUFBSSxLQUFLLFlBQVksWUFBWSxDQUFDLElBQUksS0FBSztBQUFBLEVBQ3JGO0FBQUEsRUFFTyxZQUFZLFFBQXdCO0FBQzFDLFVBQU0sVUFBVSxLQUFLLE9BQU8sTUFBTTtBQUNsQyxXQUFPLEtBQUssYUFBYSxPQUFPO0FBQUEsRUFDakM7QUFBQSxFQUVPLGdCQUFnQixRQUF3QjtBQUM5QyxVQUFNLFVBQVUsS0FBSyxPQUFPLE1BQU07QUFDbEMsUUFBSSxRQUFRLGNBQWMsUUFBUSxLQUFLLE1BQU0sUUFBUTtBQUVwRCxZQUFNLGVBQWUsUUFBUSxLQUFLLEtBQUs7QUFDdkMsVUFBSSxDQUFDLGdCQUFnQixpQkFBaUIsVUFBVTtBQUMvQyxlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sU0FBUyxLQUFLLFNBQVMsYUFBYSxNQUFNLFdBQVc7QUFDM0QsWUFBTSxjQUFjLEtBQUssZUFBZSxhQUFhLE1BQU0sYUFBYSxhQUFhLE1BQU0sS0FBSztBQUNoRyxhQUFPLE9BQU8sT0FBTyxVQUFVLGFBQWEsY0FBYyxhQUFhLE1BQU0sTUFBTTtBQUFBLElBQ3BGLE9BQU87QUFDTixZQUFNLFNBQVMsS0FBSyxTQUFTLFFBQVEsS0FBSyxNQUFNLFdBQVc7QUFDM0QsWUFBTSxjQUFjLEtBQUssZUFBZSxRQUFRLEtBQUssTUFBTSxhQUFhLFFBQVEsS0FBSyxNQUFNLEtBQUs7QUFDaEcsWUFBTSxlQUFlLGNBQWMsUUFBUTtBQUMzQyxZQUFNLFlBQVksY0FBYyxRQUFRLEtBQUssTUFBTTtBQUNuRCxhQUFPLE9BQU8sT0FBTyxVQUFVLGNBQWMsU0FBUztBQUFBLElBQ3ZEO0FBQUEsRUFDRDtBQUFBLEVBRU8sa0JBQWtCLE1BQWdCLFVBQW9CLGlCQUF5QixhQUFxQixhQUEyQixXQUF5QixZQUF3QixnQkFBeUIsa0JBQTBCLFdBQW1CLFFBQXFCO0FBQ2pSLFVBQU0sU0FBUyxLQUFLLFNBQVMsS0FBSyxNQUFNLFdBQVc7QUFDbkQsVUFBTSxzQkFBc0IsS0FBSyxlQUFlLEtBQUssTUFBTSxhQUFhLEtBQUssTUFBTSxLQUFLO0FBQ3hGLFVBQU0sUUFBUSxLQUFLLGVBQWUsS0FBSyxNQUFNLGFBQWEsV0FBVztBQUNyRSxVQUFNLE1BQU0sS0FBSyxlQUFlLEtBQUssTUFBTSxhQUFhLFNBQVM7QUFFakUsUUFBSTtBQUVKLFVBQU0sTUFBb0IsRUFBRSxNQUFNLEdBQUcsUUFBUSxFQUFFO0FBQy9DLFFBQUk7QUFDSixRQUFJO0FBRUosUUFBSSxTQUFTLGlCQUFpQjtBQUM3QixtQkFBYSxPQUFPLE9BQU8sVUFBVSxPQUFPLEdBQUc7QUFDL0MsdUJBQWlCLENBQUMsV0FBbUIsU0FBUztBQUM5QyxlQUFTLE1BQU0sQ0FBQztBQUFBLElBQ2pCLE9BQU87QUFDTixtQkFBYSxPQUFPO0FBQ3BCLHVCQUFpQixDQUFDLFdBQW1CO0FBQ3JDLGVBQVMsTUFBTSxLQUFLO0FBQUEsSUFDckI7QUFFQSxPQUFHO0FBQ0YsVUFBSSxTQUFTLEtBQUssVUFBVTtBQUU1QixVQUFJLEdBQUc7QUFDTixZQUFJLGVBQWUsRUFBRSxLQUFLLEtBQUssS0FBSztBQUNuQyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxhQUFLLGlCQUFpQixNQUFNLGVBQWUsRUFBRSxLQUFLLElBQUkscUJBQXFCLEdBQUc7QUFDOUUsY0FBTSxjQUFjLEtBQUssZUFBZSxLQUFLLE1BQU0sYUFBYSxhQUFhLEdBQUc7QUFDaEYsY0FBTSxpQkFBaUIsSUFBSSxTQUFTLFlBQVksT0FBTyxJQUFJLFNBQVMsWUFBWSxTQUFTLGNBQWMsSUFBSSxTQUFTO0FBQ3BILGNBQU0sZUFBZSxpQkFBaUIsRUFBRSxDQUFDLEVBQUU7QUFDM0MsZUFBTyxXQUFXLElBQUksZ0JBQWdCLElBQUksTUFBTSxrQkFBa0IsYUFBYSxnQkFBZ0Isa0JBQWtCLGFBQWEsWUFBWSxHQUFHLEdBQUcsY0FBYztBQUU5SixZQUFJLGVBQWUsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxLQUFLO0FBQ2pELGlCQUFPO0FBQUEsUUFDUjtBQUNBLFlBQUksYUFBYSxrQkFBa0I7QUFDbEMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBRUQsU0FBUztBQUVULFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxzQkFBc0IsYUFBb0IsWUFBd0IsZ0JBQXlCLGtCQUF1QztBQUN4SSxVQUFNLFNBQXNCLENBQUM7QUFDN0IsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sV0FBVyxJQUFJLFNBQVMsV0FBVyxnQkFBZ0IsV0FBVyxLQUFLO0FBRXpFLFFBQUksZ0JBQWdCLEtBQUssUUFBUSxZQUFZLGlCQUFpQixZQUFZLFdBQVc7QUFDckYsUUFBSSxrQkFBa0IsTUFBTTtBQUMzQixhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsVUFBTSxjQUFjLEtBQUssUUFBUSxZQUFZLGVBQWUsWUFBWSxTQUFTO0FBQ2pGLFFBQUksZ0JBQWdCLE1BQU07QUFDekIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFFBQUksUUFBUSxLQUFLLGlCQUFpQixjQUFjLE1BQU0sY0FBYyxTQUFTO0FBQzdFLFVBQU0sTUFBTSxLQUFLLGlCQUFpQixZQUFZLE1BQU0sWUFBWSxTQUFTO0FBRXpFLFFBQUksY0FBYyxTQUFTLFlBQVksTUFBTTtBQUM1QyxXQUFLLGtCQUFrQixjQUFjLE1BQU0sVUFBVSxZQUFZLGlCQUFpQixZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksZ0JBQWdCLGtCQUFrQixXQUFXLE1BQU07QUFDdEwsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGtCQUFrQixZQUFZO0FBRWxDLFFBQUksY0FBYyxjQUFjO0FBQ2hDLFdBQU8sZ0JBQWdCLFlBQVksTUFBTTtBQUN4QyxZQUFNLGVBQWUsS0FBSyxlQUFlLFlBQVksTUFBTSxhQUFhLE9BQU8sWUFBWSxNQUFNLEdBQUc7QUFFcEcsVUFBSSxnQkFBZ0IsR0FBRztBQUV0QixjQUFNLGFBQWEsS0FBSyxTQUFTLFlBQVksTUFBTSxXQUFXLEVBQUU7QUFDaEUsY0FBTSxzQkFBc0IsS0FBSyxlQUFlLFlBQVksTUFBTSxhQUFhLFlBQVksTUFBTSxLQUFLO0FBQ3RHLGNBQU0sc0JBQXNCLFdBQVcsTUFBTSxPQUFPLFlBQVk7QUFDaEUsY0FBTUMsZUFBYyxvQkFBb0IsWUFBWSxrQkFBa0IsWUFBWSxjQUFjO0FBQ2hHLG9CQUFZLEtBQUssa0JBQWtCLGFBQWEsVUFBVSxpQkFBaUJBLGNBQWEsT0FBTyxLQUFLLGlCQUFpQixhQUFhLHNCQUFzQixtQkFBbUIsR0FBRyxZQUFZLGdCQUFnQixrQkFBa0IsV0FBVyxNQUFNO0FBRTdPLFlBQUksYUFBYSxrQkFBa0I7QUFDbEMsaUJBQU87QUFBQSxRQUNSO0FBRUEsMkJBQW1CO0FBQUEsTUFDcEI7QUFFQSxZQUFNQSxlQUFjLG9CQUFvQixZQUFZLGtCQUFrQixZQUFZLGNBQWMsSUFBSTtBQUVwRyxVQUFJLG9CQUFvQixZQUFZLGVBQWU7QUFDbEQsY0FBTSxPQUFPLEtBQUssZUFBZSxlQUFlLEVBQUUsVUFBVUEsY0FBYSxZQUFZLFlBQVksQ0FBQztBQUNsRyxvQkFBWSxLQUFLLG1CQUFtQixZQUFZLFVBQVUsTUFBTSxZQUFZLGVBQWVBLGNBQWEsV0FBVyxRQUFRLGdCQUFnQixnQkFBZ0I7QUFDM0osZUFBTztBQUFBLE1BQ1I7QUFFQSxrQkFBWSxLQUFLLG1CQUFtQixZQUFZLFVBQVUsS0FBSyxlQUFlLGVBQWUsRUFBRSxPQUFPQSxZQUFXLEdBQUcsaUJBQWlCQSxjQUFhLFdBQVcsUUFBUSxnQkFBZ0IsZ0JBQWdCO0FBRXJNLFVBQUksYUFBYSxrQkFBa0I7QUFDbEMsZUFBTztBQUFBLE1BQ1I7QUFFQTtBQUNBLHNCQUFnQixLQUFLLFFBQVEsaUJBQWlCLENBQUM7QUFDL0Msb0JBQWMsY0FBYztBQUM1QixjQUFRLEtBQUssaUJBQWlCLGNBQWMsTUFBTSxjQUFjLFNBQVM7QUFBQSxJQUMxRTtBQUVBLFFBQUksb0JBQW9CLFlBQVksZUFBZTtBQUNsRCxZQUFNQSxlQUFjLG9CQUFvQixZQUFZLGtCQUFrQixZQUFZLGNBQWMsSUFBSTtBQUNwRyxZQUFNLE9BQU8sS0FBSyxlQUFlLGVBQWUsRUFBRSxVQUFVQSxjQUFhLFlBQVksWUFBWSxDQUFDO0FBQ2xHLGtCQUFZLEtBQUssbUJBQW1CLFlBQVksVUFBVSxNQUFNLFlBQVksZUFBZUEsY0FBYSxXQUFXLFFBQVEsZ0JBQWdCLGdCQUFnQjtBQUMzSixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sY0FBYyxvQkFBb0IsWUFBWSxrQkFBa0IsWUFBWSxjQUFjO0FBQ2hHLGdCQUFZLEtBQUssa0JBQWtCLFlBQVksTUFBTSxVQUFVLGlCQUFpQixhQUFhLE9BQU8sS0FBSyxZQUFZLGdCQUFnQixrQkFBa0IsV0FBVyxNQUFNO0FBQ3hLLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsWUFBd0IsVUFBb0IsTUFBYyxZQUFvQixhQUFxQixXQUFtQixRQUFxQixnQkFBeUIsa0JBQWtDO0FBQ2hPLFVBQU0saUJBQWlCLFdBQVc7QUFDbEMsUUFBSSxDQUFDLGtCQUFrQixXQUFXLGNBQWM7QUFDL0MsWUFBTSxlQUFlLFdBQVc7QUFDaEMsWUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxZQUFNLGFBQWEsS0FBSztBQUV4QixVQUFJLGlCQUFpQixDQUFDO0FBQ3RCLGNBQVEsaUJBQWlCLEtBQUssUUFBUSxjQUFjLGlCQUFpQixlQUFlLE9BQU8sSUFBSTtBQUM5RixZQUFJLENBQUMsa0JBQWtCLGFBQWEsZ0JBQWdCLE1BQU0sWUFBWSxnQkFBZ0IsZUFBZSxHQUFHO0FBQ3ZHLGlCQUFPLFdBQVcsSUFBSSxJQUFJLFVBQVUsSUFBSSxNQUFNLFlBQVksaUJBQWlCLElBQUksYUFBYSxZQUFZLGlCQUFpQixJQUFJLGtCQUFrQixXQUFXLEdBQUcsSUFBSTtBQUNqSyxjQUFJLGFBQWEsa0JBQWtCO0FBQ2xDLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBRUosYUFBUyxNQUFNLENBQUM7QUFDaEIsT0FBRztBQUNGLFVBQUksU0FBUyxLQUFLLElBQUk7QUFDdEIsVUFBSSxHQUFHO0FBQ04sZUFBTyxXQUFXLElBQUksZ0JBQWdCLElBQUksTUFBTSxZQUFZLEVBQUUsUUFBUSxJQUFJLGFBQWEsWUFBWSxFQUFFLFFBQVEsSUFBSSxFQUFFLENBQUMsRUFBRSxTQUFTLFdBQVcsR0FBRyxHQUFHLGNBQWM7QUFDOUosWUFBSSxhQUFhLGtCQUFrQjtBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTO0FBQ1QsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUEsRUFLTyxPQUFPLFFBQWdCLE9BQWUsZ0JBQXlCLE9BQWE7QUFDbEYsU0FBSyxpQkFBaUIsS0FBSyxrQkFBa0I7QUFDN0MsU0FBSyxpQkFBaUIsYUFBYTtBQUNuQyxTQUFLLGlCQUFpQixRQUFRO0FBRTlCLFFBQUksS0FBSyxTQUFTLFVBQVU7QUFDM0IsWUFBTSxFQUFFLE1BQU0sV0FBVyxnQkFBZ0IsSUFBSSxLQUFLLE9BQU8sTUFBTTtBQUMvRCxZQUFNLFFBQVEsS0FBSztBQUNuQixZQUFNLGNBQWMsTUFBTTtBQUMxQixZQUFNLG9CQUFvQixLQUFLLGlCQUFpQixNQUFNLFNBQVM7QUFDL0QsVUFBSSxLQUFLLE1BQU0sZ0JBQWdCLEtBQzlCLE1BQU0sSUFBSSxTQUFTLEtBQUsscUJBQXFCLFFBQzdDLE1BQU0sSUFBSSxXQUFXLEtBQUsscUJBQXFCLFVBQzlDLGtCQUFrQixNQUFNLFdBQVcsVUFDcEMsTUFBTSxTQUFTLG1CQUNkO0FBRUQsYUFBSyxhQUFhLE1BQU0sS0FBSztBQUM3QixhQUFLLHNCQUFzQjtBQUMzQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLG9CQUFvQixRQUFRO0FBQy9CLGFBQUssd0JBQXdCLE9BQU8sSUFBSTtBQUN4QyxhQUFLLGFBQWEsU0FBUyxNQUFNO0FBQUEsTUFDbEMsV0FBVyxrQkFBa0IsS0FBSyxNQUFNLFNBQVMsUUFBUTtBQUV4RCxjQUFNLGFBQXlCLENBQUM7QUFDaEMsWUFBSSxnQkFBZ0IsSUFBSTtBQUFBLFVBQ3ZCLE1BQU07QUFBQSxVQUNOO0FBQUEsVUFDQSxNQUFNO0FBQUEsVUFDTixLQUFLLGVBQWUsTUFBTSxhQUFhLG1CQUFtQixNQUFNLEdBQUc7QUFBQSxVQUNuRSxLQUFLLGVBQWUsYUFBYSxNQUFNLEdBQUcsSUFBSSxLQUFLLGVBQWUsYUFBYSxpQkFBaUI7QUFBQSxRQUNqRztBQUVBLFlBQUksS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLFVBQVUsS0FBSyxHQUFHO0FBQ3BELGdCQUFNLGNBQWMsS0FBSyxlQUFlLE1BQU0sU0FBUztBQUV2RCxjQUFJLGdCQUFnQixJQUFjO0FBQ2pDLGtCQUFNLFdBQXlCLEVBQUUsTUFBTSxjQUFjLE1BQU0sT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUMvRSw0QkFBZ0IsSUFBSTtBQUFBLGNBQ25CLGNBQWM7QUFBQSxjQUNkO0FBQUEsY0FDQSxjQUFjO0FBQUEsY0FDZCxLQUFLLGVBQWUsY0FBYyxhQUFhLFVBQVUsY0FBYyxHQUFHO0FBQUEsY0FDMUUsY0FBYyxTQUFTO0FBQUEsWUFDeEI7QUFFQSxxQkFBUztBQUFBLFVBQ1Y7QUFBQSxRQUNEO0FBR0EsWUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssWUFBWSxLQUFLLEdBQUc7QUFDdEQsZ0JBQU0sYUFBYSxLQUFLLGVBQWUsTUFBTSxZQUFZLENBQUM7QUFDMUQsY0FBSSxlQUFlLElBQWM7QUFDaEMsa0JBQU0sY0FBYyxLQUFLLGlCQUFpQixNQUFNLFlBQVksQ0FBQztBQUM3RCxpQkFBSyxlQUFlLE1BQU0sV0FBVztBQUNyQyxvQkFBUSxPQUFPO0FBRWYsZ0JBQUksS0FBSyxNQUFNLFdBQVcsR0FBRztBQUM1Qix5QkFBVyxLQUFLLElBQUk7QUFBQSxZQUNyQjtBQUFBLFVBQ0QsT0FBTztBQUNOLGlCQUFLLGVBQWUsTUFBTSxpQkFBaUI7QUFBQSxVQUM1QztBQUFBLFFBQ0QsT0FBTztBQUNOLGVBQUssZUFBZSxNQUFNLGlCQUFpQjtBQUFBLFFBQzVDO0FBRUEsY0FBTSxZQUFZLEtBQUssZ0JBQWdCLEtBQUs7QUFDNUMsWUFBSSxjQUFjLFNBQVMsR0FBRztBQUM3QixlQUFLLGNBQWMsTUFBTSxhQUFhO0FBQUEsUUFDdkM7QUFFQSxZQUFJLFVBQVU7QUFDZCxpQkFBUyxJQUFJLEdBQUcsSUFBSSxVQUFVLFFBQVEsS0FBSztBQUMxQyxvQkFBVSxLQUFLLGNBQWMsU0FBUyxVQUFVLENBQUMsQ0FBQztBQUFBLFFBQ25EO0FBQ0EsYUFBSyxZQUFZLFVBQVU7QUFBQSxNQUM1QixPQUFPO0FBQ04sYUFBSyx5QkFBeUIsT0FBTyxJQUFJO0FBQUEsTUFDMUM7QUFBQSxJQUNELE9BQU87QUFFTixZQUFNLFNBQVMsS0FBSyxnQkFBZ0IsS0FBSztBQUN6QyxVQUFJLE9BQU8sS0FBSyxhQUFhLE1BQU0sT0FBTyxDQUFDLENBQUM7QUFFNUMsZUFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2QyxlQUFPLEtBQUssY0FBYyxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBR0EsU0FBSyxzQkFBc0I7QUFBQSxFQUM1QjtBQUFBLEVBRU8sT0FBTyxRQUFnQixLQUFtQjtBQUNoRCxTQUFLLGlCQUFpQixhQUFhO0FBQ25DLFNBQUssaUJBQWlCLFFBQVE7QUFFOUIsUUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTLFVBQVU7QUFDdkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLE1BQU07QUFDeEMsVUFBTSxjQUFjLEtBQUssT0FBTyxTQUFTLEdBQUc7QUFDNUMsVUFBTSxZQUFZLGNBQWM7QUFDaEMsVUFBTSxVQUFVLFlBQVk7QUFFNUIsUUFBSSxjQUFjLFNBQVM7QUFDMUIsWUFBTUMseUJBQXdCLEtBQUssaUJBQWlCLFdBQVcsY0FBYyxTQUFTO0FBQ3RGLFlBQU1DLHVCQUFzQixLQUFLLGlCQUFpQixXQUFXLFlBQVksU0FBUztBQUVsRixVQUFJLGNBQWMsb0JBQW9CLFFBQVE7QUFDN0MsWUFBSSxRQUFRLFVBQVUsTUFBTSxRQUFRO0FBQ25DLGdCQUFNLE9BQU8sVUFBVSxLQUFLO0FBQzVCLG1CQUFTLE1BQU0sU0FBUztBQUN4QixlQUFLLHlCQUF5QixJQUFJO0FBQ2xDLGVBQUssc0JBQXNCO0FBQzNCO0FBQUEsUUFDRDtBQUNBLGFBQUssZUFBZSxXQUFXQSxvQkFBbUI7QUFDbEQsYUFBSyxhQUFhLFNBQVMsTUFBTTtBQUNqQyxhQUFLLHlCQUF5QixTQUFTO0FBQ3ZDLGFBQUssc0JBQXNCO0FBQzNCO0FBQUEsTUFDRDtBQUVBLFVBQUksY0FBYyxrQkFBa0IsVUFBVSxNQUFNLFdBQVcsU0FBUyxLQUFLO0FBQzVFLGFBQUssZUFBZSxXQUFXRCxzQkFBcUI7QUFDcEQsYUFBSyx5QkFBeUIsU0FBUztBQUN2QyxhQUFLLHNCQUFzQjtBQUMzQjtBQUFBLE1BQ0Q7QUFHQSxXQUFLLFdBQVcsV0FBV0Esd0JBQXVCQyxvQkFBbUI7QUFDckUsV0FBSyxzQkFBc0I7QUFDM0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUF5QixDQUFDO0FBRWhDLFVBQU0sd0JBQXdCLEtBQUssaUJBQWlCLFdBQVcsY0FBYyxTQUFTO0FBQ3RGLFNBQUssZUFBZSxXQUFXLHFCQUFxQjtBQUNwRCxTQUFLLGFBQWEsU0FBUyxNQUFNO0FBQ2pDLFFBQUksVUFBVSxNQUFNLFdBQVcsR0FBRztBQUNqQyxpQkFBVyxLQUFLLFNBQVM7QUFBQSxJQUMxQjtBQUdBLFVBQU0sc0JBQXNCLEtBQUssaUJBQWlCLFNBQVMsWUFBWSxTQUFTO0FBQ2hGLFNBQUssZUFBZSxTQUFTLG1CQUFtQjtBQUNoRCxRQUFJLFFBQVEsTUFBTSxXQUFXLEdBQUc7QUFDL0IsaUJBQVcsS0FBSyxPQUFPO0FBQUEsSUFDeEI7QUFHQSxVQUFNLGFBQWEsVUFBVSxLQUFLO0FBQ2xDLGFBQVMsT0FBTyxZQUFZLFNBQVMsWUFBWSxTQUFTLFNBQVMsT0FBTyxLQUFLLEtBQUssR0FBRztBQUN0RixpQkFBVyxLQUFLLElBQUk7QUFBQSxJQUNyQjtBQUVBLFVBQU0sT0FBTyxVQUFVLE1BQU0sV0FBVyxJQUFJLFVBQVUsS0FBSyxJQUFJO0FBQy9ELFNBQUssWUFBWSxVQUFVO0FBQzNCLFNBQUsseUJBQXlCLElBQUk7QUFDbEMsU0FBSyxzQkFBc0I7QUFBQSxFQUM1QjtBQUFBLEVBRVEsd0JBQXdCLE9BQWUsTUFBZ0I7QUFFOUQsVUFBTSxhQUF5QixDQUFDO0FBQ2hDLFFBQUksS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLFVBQVUsS0FBSyxLQUFLLEtBQUssWUFBWSxJQUFJLEdBQUc7QUFHOUUsWUFBTSxRQUFRLEtBQUs7QUFDbkIsWUFBTSxXQUF5QixFQUFFLE1BQU0sTUFBTSxNQUFNLE9BQU8sR0FBRyxRQUFRLEVBQUU7QUFDdkUsWUFBTSxTQUFTLElBQUk7QUFBQSxRQUNsQixNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sS0FBSyxlQUFlLE1BQU0sYUFBYSxVQUFVLE1BQU0sR0FBRztBQUFBLFFBQzFELE1BQU0sU0FBUztBQUFBLE1BQ2hCO0FBRUEsV0FBSyxRQUFRO0FBRWIsZUFBUztBQUNULHlCQUFtQixNQUFNLE1BQU0sSUFBSSxFQUFFO0FBRXJDLFVBQUksS0FBSyxNQUFNLFdBQVcsR0FBRztBQUM1QixtQkFBVyxLQUFLLElBQUk7QUFBQSxNQUNyQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUM1QyxRQUFJLFVBQVUsS0FBSyxhQUFhLE1BQU0sVUFBVSxVQUFVLFNBQVMsQ0FBQyxDQUFDO0FBQ3JFLGFBQVMsSUFBSSxVQUFVLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUMvQyxnQkFBVSxLQUFLLGFBQWEsU0FBUyxVQUFVLENBQUMsQ0FBQztBQUFBLElBQ2xEO0FBQ0EsU0FBSyx5QkFBeUIsT0FBTztBQUNyQyxTQUFLLFlBQVksVUFBVTtBQUFBLEVBQzVCO0FBQUEsRUFFUSx5QkFBeUIsT0FBZSxNQUFnQjtBQUUvRCxRQUFJLEtBQUssNkJBQTZCLE9BQU8sSUFBSSxHQUFHO0FBRW5ELGVBQVM7QUFBQSxJQUNWO0FBRUEsVUFBTSxZQUFZLEtBQUssZ0JBQWdCLEtBQUs7QUFDNUMsVUFBTSxVQUFVLEtBQUssY0FBYyxNQUFNLFVBQVUsQ0FBQyxDQUFDO0FBQ3JELFFBQUksVUFBVTtBQUVkLGFBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDMUMsZ0JBQVUsS0FBSyxjQUFjLFNBQVMsVUFBVSxDQUFDLENBQUM7QUFBQSxJQUNuRDtBQUVBLFNBQUsseUJBQXlCLE9BQU87QUFBQSxFQUN0QztBQUFBLEVBSVEsaUJBQWlCLE1BQWdCLFdBQW1CLEtBQXlDO0FBQ3BHLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQU0sY0FBYyxLQUFLLE1BQU07QUFDL0IsVUFBTSxhQUFhLEtBQUssU0FBUyxXQUFXLEVBQUU7QUFFOUMsVUFBTSxjQUFjLFdBQVcsTUFBTSxNQUFNLElBQUksSUFBSSxNQUFNLE1BQU07QUFFL0QsVUFBTSxTQUFTLGNBQWM7QUFHN0IsUUFBSSxNQUFNLE1BQU0sTUFBTTtBQUN0QixRQUFJLE9BQU8sTUFBTSxJQUFJO0FBRXJCLFFBQUksTUFBYztBQUNsQixRQUFJLFVBQWtCO0FBQ3RCLFFBQUksV0FBbUI7QUFFdkIsV0FBTyxPQUFPLE1BQU07QUFDbkIsWUFBTSxPQUFRLE9BQU8sT0FBTyxJQUFLO0FBQ2pDLGlCQUFXLFdBQVcsR0FBRztBQUV6QixVQUFJLFFBQVEsTUFBTTtBQUNqQjtBQUFBLE1BQ0Q7QUFFQSxnQkFBVSxXQUFXLE1BQU0sQ0FBQztBQUU1QixVQUFJLFNBQVMsVUFBVTtBQUN0QixlQUFPLE1BQU07QUFBQSxNQUNkLFdBQVcsVUFBVSxTQUFTO0FBQzdCLGNBQU0sTUFBTTtBQUFBLE1BQ2IsT0FBTztBQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUs7QUFDUixVQUFJLE9BQU87QUFDWCxVQUFJLFNBQVMsU0FBUztBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFFBQVEsU0FBUztBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxhQUFxQixPQUFxQixLQUEyQjtBQUczRixRQUFJLElBQUksV0FBVyxHQUFHO0FBQ3JCLGFBQU8sSUFBSSxPQUFPLE1BQU07QUFBQSxJQUN6QjtBQUVBLFVBQU0sYUFBYSxLQUFLLFNBQVMsV0FBVyxFQUFFO0FBQzlDLFFBQUksSUFBSSxTQUFTLFdBQVcsU0FBUyxHQUFHO0FBQ3ZDLGFBQU8sSUFBSSxPQUFPLE1BQU07QUFBQSxJQUN6QjtBQUVBLFVBQU0sc0JBQXNCLFdBQVcsSUFBSSxPQUFPLENBQUM7QUFDbkQsVUFBTSxZQUFZLFdBQVcsSUFBSSxJQUFJLElBQUksSUFBSTtBQUM3QyxRQUFJLHNCQUFzQixZQUFZLEdBQUc7QUFDeEMsYUFBTyxJQUFJLE9BQU8sTUFBTTtBQUFBLElBQ3pCO0FBSUEsVUFBTSxxQkFBcUIsWUFBWTtBQUN2QyxVQUFNLFNBQVMsS0FBSyxTQUFTLFdBQVcsRUFBRTtBQUUxQyxRQUFJLE9BQU8sV0FBVyxrQkFBa0IsTUFBTSxJQUFJO0FBQ2pELGFBQU8sSUFBSSxPQUFPLE1BQU0sT0FBTztBQUFBLElBQ2hDLE9BQU87QUFDTixhQUFPLElBQUksT0FBTyxNQUFNO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLGFBQXFCLFFBQThCO0FBQ3pFLFVBQU0sYUFBYSxLQUFLLFNBQVMsV0FBVyxFQUFFO0FBQzlDLFdBQU8sV0FBVyxPQUFPLElBQUksSUFBSSxPQUFPO0FBQUEsRUFDekM7QUFBQSxFQUVRLFlBQVksT0FBeUI7QUFDNUMsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUN0QyxlQUFTLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixNQUF1QjtBQUM5QyxRQUFJLEtBQUssU0FBUyxtQkFBbUI7QUFHcEMsWUFBTSxZQUFxQixDQUFDO0FBQzVCLGFBQU8sS0FBSyxTQUFTLG1CQUFtQjtBQUN2QyxjQUFNLFdBQVcsS0FBSyxXQUFXLG9CQUFvQixDQUFDO0FBQ3RELFlBQUk7QUFDSixZQUFJLGFBQWEsU0FBUyxrQkFBbUIsWUFBWSxTQUFVLFlBQVksT0FBUztBQUV2RixzQkFBWSxLQUFLLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQztBQUNuRCxpQkFBTyxLQUFLLFVBQVUsb0JBQW9CLENBQUM7QUFBQSxRQUM1QyxPQUFPO0FBQ04sc0JBQVksS0FBSyxVQUFVLEdBQUcsaUJBQWlCO0FBQy9DLGlCQUFPLEtBQUssVUFBVSxpQkFBaUI7QUFBQSxRQUN4QztBQUVBLGNBQU1DLGNBQWEscUJBQXFCLFNBQVM7QUFDakQsa0JBQVUsS0FBSyxJQUFJO0FBQUEsVUFDbEIsS0FBSyxTQUFTO0FBQUE7QUFBQSxVQUNkLEVBQUUsTUFBTSxHQUFHLFFBQVEsRUFBRTtBQUFBLFVBQ3JCLEVBQUUsTUFBTUEsWUFBVyxTQUFTLEdBQUcsUUFBUSxVQUFVLFNBQVNBLFlBQVdBLFlBQVcsU0FBUyxDQUFDLEVBQUU7QUFBQSxVQUM1RkEsWUFBVyxTQUFTO0FBQUEsVUFDcEIsVUFBVTtBQUFBLFFBQ1gsQ0FBQztBQUNELGFBQUssU0FBUyxLQUFLLElBQUksYUFBYSxXQUFXQSxXQUFVLENBQUM7QUFBQSxNQUMzRDtBQUVBLFlBQU1BLGNBQWEscUJBQXFCLElBQUk7QUFDNUMsZ0JBQVUsS0FBSyxJQUFJO0FBQUEsUUFDbEIsS0FBSyxTQUFTO0FBQUE7QUFBQSxRQUNkLEVBQUUsTUFBTSxHQUFHLFFBQVEsRUFBRTtBQUFBLFFBQ3JCLEVBQUUsTUFBTUEsWUFBVyxTQUFTLEdBQUcsUUFBUSxLQUFLLFNBQVNBLFlBQVdBLFlBQVcsU0FBUyxDQUFDLEVBQUU7QUFBQSxRQUN2RkEsWUFBVyxTQUFTO0FBQUEsUUFDcEIsS0FBSztBQUFBLE1BQ04sQ0FBQztBQUNELFdBQUssU0FBUyxLQUFLLElBQUksYUFBYSxNQUFNQSxXQUFVLENBQUM7QUFFckQsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGNBQWMsS0FBSyxTQUFTLENBQUMsRUFBRSxPQUFPO0FBQzFDLFVBQU0sYUFBYSxxQkFBcUIsTUFBTSxLQUFLO0FBRW5ELFFBQUksUUFBUSxLQUFLO0FBQ2pCLFFBQUksS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFXLEtBQUssU0FBUyxDQUFDLEVBQUUsV0FBVyxTQUFTLENBQUMsTUFBTSxlQUN4RSxnQkFBZ0IsS0FDaEIsS0FBSyxZQUFZLElBQUksS0FDckIsS0FBSyxVQUFVLEtBQUssU0FBUyxDQUFDLEVBQUUsTUFBTSxHQUN4QztBQUNELFdBQUssdUJBQXVCLEVBQUUsTUFBTSxLQUFLLHFCQUFxQixNQUFNLFFBQVEsS0FBSyxxQkFBcUIsU0FBUyxFQUFFO0FBQ2pILGNBQVEsS0FBSztBQUViLGVBQVMsSUFBSSxHQUFHLElBQUksV0FBVyxRQUFRLEtBQUs7QUFDM0MsbUJBQVcsQ0FBQyxLQUFLLGNBQWM7QUFBQSxNQUNoQztBQUVBLFdBQUssU0FBUyxDQUFDLEVBQUUsYUFBd0IsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFZLE9BQWlCLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDMUcsV0FBSyxTQUFTLENBQUMsRUFBRSxVQUFVLE1BQU07QUFDakMscUJBQWU7QUFBQSxJQUNoQixPQUFPO0FBQ04sVUFBSSxnQkFBZ0IsR0FBRztBQUN0QixpQkFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMzQyxxQkFBVyxDQUFDLEtBQUs7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFNBQVMsQ0FBQyxFQUFFLGFBQXdCLEtBQUssU0FBUyxDQUFDLEVBQUUsV0FBWSxPQUFpQixXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBQzFHLFdBQUssU0FBUyxDQUFDLEVBQUUsVUFBVTtBQUFBLElBQzVCO0FBRUEsVUFBTSxZQUFZLEtBQUssU0FBUyxDQUFDLEVBQUUsT0FBTztBQUMxQyxVQUFNLFdBQVcsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFXLFNBQVM7QUFDdEQsVUFBTSxZQUFZLFlBQVksS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFXLFFBQVE7QUFDbEUsVUFBTSxTQUFTLEVBQUUsTUFBTSxVQUFVLFFBQVEsVUFBVTtBQUNuRCxVQUFNLFdBQVcsSUFBSTtBQUFBLE1BQ3BCO0FBQUE7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSyxlQUFlLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEMsWUFBWTtBQUFBLElBQ2I7QUFDQSxTQUFLLHVCQUF1QjtBQUM1QixXQUFPLENBQUMsUUFBUTtBQUFBLEVBQ2pCO0FBQUEsRUFFTyxxQkFBNkI7QUFDbkMsV0FBTyxLQUFLLG9CQUFvQixLQUFLLElBQUk7QUFBQSxFQUMxQztBQUFBLEVBRU8sa0JBQWtCLFlBQW9CLFlBQW9CLEdBQVc7QUFDM0UsUUFBSSxJQUFJLEtBQUs7QUFFYixRQUFJLE1BQU07QUFDVixVQUFNLFFBQVEsS0FBSyxhQUFhLEtBQUssVUFBVTtBQUMvQyxRQUFJLE9BQU87QUFDVixVQUFJLE1BQU07QUFDVixZQUFNLHVCQUF1QixLQUFLLG9CQUFvQixHQUFHLGFBQWEsTUFBTSxzQkFBc0IsQ0FBQztBQUNuRyxZQUFNLFNBQVMsS0FBSyxTQUFTLEVBQUUsTUFBTSxXQUFXLEVBQUU7QUFDbEQsWUFBTSxjQUFjLEtBQUssZUFBZSxFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sS0FBSztBQUMxRSxVQUFJLE1BQU0sc0JBQXNCLEVBQUUsTUFBTSxnQkFBZ0IsWUFBWTtBQUNuRSxjQUFNLE9BQU8sVUFBVSxjQUFjLHNCQUFzQixjQUFjLEVBQUUsTUFBTSxNQUFNO0FBQUEsTUFDeEYsT0FBTztBQUNOLGNBQU0sbUJBQW1CLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxNQUFNLG1CQUFtQjtBQUMzRixlQUFPLE9BQU8sVUFBVSxjQUFjLHNCQUFzQixjQUFjLG1CQUFtQixTQUFTO0FBQUEsTUFDdkc7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLGtCQUFrQjtBQUN0QixZQUFNLHFCQUFxQjtBQUMzQixhQUFPLE1BQU0sVUFBVTtBQUN0QixZQUFJLEVBQUUsU0FBUyxZQUFZLEVBQUUsV0FBVyxhQUFhLEdBQUc7QUFDdkQsY0FBSSxFQUFFO0FBQUEsUUFDUCxXQUFXLEVBQUUsVUFBVSxFQUFFLE1BQU0sY0FBYyxhQUFhLEdBQUc7QUFDNUQsZ0JBQU0sdUJBQXVCLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxFQUFFLFVBQVUsQ0FBQztBQUNuRixnQkFBTSxtQkFBbUIsS0FBSyxvQkFBb0IsR0FBRyxhQUFhLEVBQUUsVUFBVSxDQUFDO0FBQy9FLGdCQUFNLFNBQVMsS0FBSyxTQUFTLEVBQUUsTUFBTSxXQUFXLEVBQUU7QUFDbEQsZ0JBQU0sY0FBYyxLQUFLLGVBQWUsRUFBRSxNQUFNLGFBQWEsRUFBRSxNQUFNLEtBQUs7QUFDMUUsNkJBQW1CLEVBQUU7QUFDckIsZUFBSyxhQUFhLElBQUk7QUFBQSxZQUNyQixNQUFNO0FBQUEsWUFDTjtBQUFBLFlBQ0EscUJBQXFCLHNCQUFzQixhQUFhLElBQUksRUFBRTtBQUFBLFVBQy9ELENBQUM7QUFFRCxpQkFBTyxPQUFPLFVBQVUsY0FBYyxzQkFBc0IsY0FBYyxtQkFBbUIsU0FBUztBQUFBLFFBQ3ZHLFdBQVcsRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsYUFBYSxHQUFHO0FBQzlELGdCQUFNLHVCQUF1QixLQUFLLG9CQUFvQixHQUFHLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFDbkYsZ0JBQU0sU0FBUyxLQUFLLFNBQVMsRUFBRSxNQUFNLFdBQVcsRUFBRTtBQUNsRCxnQkFBTSxjQUFjLEtBQUssZUFBZSxFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sS0FBSztBQUUxRSxnQkFBTSxPQUFPLFVBQVUsY0FBYyxzQkFBc0IsY0FBYyxFQUFFLE1BQU0sTUFBTTtBQUN2RjtBQUFBLFFBQ0QsT0FBTztBQUNOLHdCQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU07QUFDbEMsNkJBQW1CLEVBQUUsWUFBWSxFQUFFLE1BQU07QUFDekMsY0FBSSxFQUFFO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxFQUFFLEtBQUs7QUFDWCxXQUFPLE1BQU0sVUFBVTtBQUN0QixZQUFNLFNBQVMsS0FBSyxTQUFTLEVBQUUsTUFBTSxXQUFXLEVBQUU7QUFFbEQsVUFBSSxFQUFFLE1BQU0sY0FBYyxHQUFHO0FBQzVCLGNBQU0sbUJBQW1CLEtBQUssb0JBQW9CLEdBQUcsQ0FBQztBQUN0RCxjQUFNLGNBQWMsS0FBSyxlQUFlLEVBQUUsTUFBTSxhQUFhLEVBQUUsTUFBTSxLQUFLO0FBRTFFLGVBQU8sT0FBTyxVQUFVLGFBQWEsY0FBYyxtQkFBbUIsU0FBUztBQUMvRSxlQUFPO0FBQUEsTUFDUixPQUFPO0FBQ04sY0FBTSxjQUFjLEtBQUssZUFBZSxFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sS0FBSztBQUMxRSxlQUFPLE9BQU8sT0FBTyxhQUFhLEVBQUUsTUFBTSxNQUFNO0FBQUEsTUFDakQ7QUFFQSxVQUFJLEVBQUUsS0FBSztBQUFBLElBQ1o7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsd0JBQXdCO0FBQy9CLFFBQUksSUFBSSxLQUFLO0FBRWIsUUFBSSxRQUFRO0FBQ1osUUFBSSxNQUFNO0FBRVYsV0FBTyxNQUFNLFVBQVU7QUFDdEIsZUFBUyxFQUFFLFVBQVUsRUFBRSxNQUFNO0FBQzdCLGFBQU8sRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUM3QixVQUFJLEVBQUU7QUFBQSxJQUNQO0FBRUEsU0FBSyxXQUFXO0FBQ2hCLFNBQUssVUFBVTtBQUNmLFNBQUssYUFBYSxTQUFTLEtBQUssT0FBTztBQUFBLEVBQ3hDO0FBQUE7QUFBQSxFQUdRLFdBQVcsTUFBZ0Isa0JBQWdFO0FBQ2xHLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQU0sTUFBTSxLQUFLLGlCQUFpQixNQUFNLGdCQUFnQjtBQUN4RCxVQUFNLFVBQVUsSUFBSSxPQUFPLE1BQU0sTUFBTTtBQUV2QyxRQUFJLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxHQUFHLElBQUksS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLEtBQUssTUFBTSxrQkFBa0I7QUFFakksWUFBTSxjQUFjLEtBQUssZUFBZSxLQUFLLE1BQU0sYUFBYSxNQUFNLE9BQU8sR0FBRztBQUNoRixVQUFJLGdCQUFnQixTQUFTO0FBRTVCLGVBQU8sRUFBRSxPQUFPLGFBQWEsV0FBVyxFQUFFO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBRUEsV0FBTyxFQUFFLE9BQU8sU0FBUyxXQUFXLElBQUksT0FBTztBQUFBLEVBQ2hEO0FBQUEsRUFFUSxvQkFBb0IsTUFBZ0IsT0FBZTtBQUMxRCxRQUFJLFFBQVEsR0FBRztBQUNkLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxhQUFhLEtBQUssU0FBUyxNQUFNLFdBQVcsRUFBRTtBQUNwRCxVQUFNLHlCQUF5QixNQUFNLE1BQU0sT0FBTyxRQUFRO0FBQzFELFFBQUkseUJBQXlCLE1BQU0sSUFBSSxNQUFNO0FBQzVDLGFBQU8sV0FBVyxNQUFNLElBQUksSUFBSSxJQUFJLE1BQU0sSUFBSSxTQUFTLFdBQVcsTUFBTSxNQUFNLElBQUksSUFBSSxNQUFNLE1BQU07QUFBQSxJQUNuRyxPQUFPO0FBQ04sYUFBTyxXQUFXLHNCQUFzQixJQUFJLFdBQVcsTUFBTSxNQUFNLElBQUksSUFBSSxNQUFNLE1BQU07QUFBQSxJQUN4RjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsTUFBZ0IsS0FBbUI7QUFDekQsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxnQkFBZ0IsTUFBTTtBQUM1QixVQUFNLG9CQUFvQixLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU0sR0FBRztBQUUxRSxVQUFNLFNBQVM7QUFDZixVQUFNLGVBQWUsS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNO0FBQ2xFLFVBQU0saUJBQWlCLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxPQUFPLE1BQU07QUFFakYsVUFBTSxXQUFXLGlCQUFpQjtBQUNsQyxVQUFNLGFBQWEsZUFBZTtBQUNsQyxVQUFNLFlBQVksTUFBTSxTQUFTO0FBRWpDLFNBQUssUUFBUSxJQUFJO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSx1QkFBbUIsTUFBTSxNQUFNLFlBQVksUUFBUTtBQUFBLEVBQ3BEO0FBQUEsRUFFUSxlQUFlLE1BQWdCLEtBQW1CO0FBQ3pELFVBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQU0sZ0JBQWdCLE1BQU07QUFDNUIsVUFBTSxzQkFBc0IsS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLEtBQUs7QUFFOUUsVUFBTSxXQUFXO0FBQ2pCLFVBQU0saUJBQWlCLEtBQUssZUFBZSxNQUFNLGFBQWEsVUFBVSxNQUFNLEdBQUc7QUFDakYsVUFBTSxpQkFBaUIsS0FBSyxlQUFlLE1BQU0sYUFBYSxRQUFRO0FBQ3RFLFVBQU0sV0FBVyxpQkFBaUI7QUFDbEMsVUFBTSxhQUFhLHNCQUFzQjtBQUN6QyxVQUFNLFlBQVksTUFBTSxTQUFTO0FBQ2pDLFNBQUssUUFBUSxJQUFJO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSx1QkFBbUIsTUFBTSxNQUFNLFlBQVksUUFBUTtBQUFBLEVBQ3BEO0FBQUEsRUFFUSxXQUFXLE1BQWdCLE9BQXFCLEtBQW1CO0FBQzFFLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQU0sbUJBQW1CLE1BQU07QUFDL0IsVUFBTSxpQkFBaUIsTUFBTTtBQUc3QixVQUFNLFlBQVksTUFBTTtBQUN4QixVQUFNLFdBQVcsTUFBTTtBQUN2QixVQUFNLFNBQVM7QUFDZixVQUFNLGlCQUFpQixLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU0sT0FBTyxNQUFNO0FBQ2pGLFVBQU0sWUFBWSxLQUFLLGVBQWUsTUFBTSxhQUFhLEtBQUssSUFBSSxLQUFLLGVBQWUsTUFBTSxhQUFhLGdCQUFnQjtBQUV6SCxTQUFLLFFBQVEsSUFBSTtBQUFBLE1BQ2hCLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLE1BQU0sTUFBTSxZQUFZLFdBQVcsaUJBQWlCLFFBQVE7QUFHL0UsVUFBTSxXQUFXLElBQUk7QUFBQSxNQUNwQixNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBLEtBQUssZUFBZSxNQUFNLGFBQWEsS0FBSyxjQUFjO0FBQUEsTUFDMUQsS0FBSyxlQUFlLE1BQU0sYUFBYSxjQUFjLElBQUksS0FBSyxlQUFlLE1BQU0sYUFBYSxHQUFHO0FBQUEsSUFDcEc7QUFFQSxVQUFNLFVBQVUsS0FBSyxjQUFjLE1BQU0sUUFBUTtBQUNqRCxTQUFLLHlCQUF5QixPQUFPO0FBQUEsRUFDdEM7QUFBQSxFQUVRLGFBQWEsTUFBZ0IsT0FBcUI7QUFDekQsUUFBSSxLQUFLLDZCQUE2QixPQUFPLElBQUksR0FBRztBQUNuRCxlQUFTO0FBQUEsSUFDVjtBQUVBLFVBQU0sVUFBVSxLQUFLLGdCQUFnQixLQUFLLEtBQUssWUFBWSxLQUFLLEtBQUssS0FBSyxVQUFVLElBQUk7QUFDeEYsVUFBTSxjQUFjLEtBQUssU0FBUyxDQUFDLEVBQUUsT0FBTztBQUM1QyxTQUFLLFNBQVMsQ0FBQyxFQUFFLFVBQVU7QUFDM0IsVUFBTSxhQUFhLHFCQUFxQixPQUFPLEtBQUs7QUFDcEQsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMzQyxpQkFBVyxDQUFDLEtBQUs7QUFBQSxJQUNsQjtBQUNBLFFBQUksU0FBUztBQUNaLFlBQU0sa0JBQWtCLEtBQUssU0FBUyxDQUFDLEVBQUUsV0FBVyxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVcsU0FBUyxDQUFDO0FBQzFGLE1BQVcsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFZLElBQUk7QUFFNUMsV0FBSyx1QkFBdUIsRUFBRSxNQUFNLEtBQUsscUJBQXFCLE9BQU8sR0FBRyxRQUFRLGNBQWMsZ0JBQWdCO0FBQUEsSUFDL0c7QUFFQSxTQUFLLFNBQVMsQ0FBQyxFQUFFLGFBQXdCLEtBQUssU0FBUyxDQUFDLEVBQUUsV0FBWSxPQUFpQixXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBQzFHLFVBQU0sV0FBVyxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVcsU0FBUztBQUN0RCxVQUFNLFlBQVksS0FBSyxTQUFTLENBQUMsRUFBRSxPQUFPLFNBQVMsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFXLFFBQVE7QUFDdkYsVUFBTSxTQUFTLEVBQUUsTUFBTSxVQUFVLFFBQVEsVUFBVTtBQUNuRCxVQUFNLFlBQVksS0FBSyxNQUFNLFNBQVMsTUFBTTtBQUM1QyxVQUFNLGlCQUFpQixLQUFLLE1BQU07QUFDbEMsVUFBTSxpQkFBaUIsS0FBSyxlQUFlLEdBQUcsS0FBSyxNQUFNLE9BQU8sTUFBTTtBQUN0RSxVQUFNLFdBQVcsaUJBQWlCO0FBRWxDLFNBQUssUUFBUSxJQUFJO0FBQUEsTUFDaEIsS0FBSyxNQUFNO0FBQUEsTUFDWCxLQUFLLE1BQU07QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsU0FBSyx1QkFBdUI7QUFDNUIsdUJBQW1CLE1BQU0sTUFBTSxNQUFNLFFBQVEsUUFBUTtBQUFBLEVBQ3REO0FBQUEsRUFFUSxPQUFPLFFBQThCO0FBQzVDLFFBQUksSUFBSSxLQUFLO0FBQ2IsVUFBTSxRQUFRLEtBQUssYUFBYSxJQUFJLE1BQU07QUFDMUMsUUFBSSxPQUFPO0FBQ1YsYUFBTztBQUFBLFFBQ04sTUFBTSxNQUFNO0FBQUEsUUFDWixpQkFBaUIsTUFBTTtBQUFBLFFBQ3ZCLFdBQVcsU0FBUyxNQUFNO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBRUEsUUFBSSxrQkFBa0I7QUFFdEIsV0FBTyxNQUFNLFVBQVU7QUFDdEIsVUFBSSxFQUFFLFlBQVksUUFBUTtBQUN6QixZQUFJLEVBQUU7QUFBQSxNQUNQLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxVQUFVLFFBQVE7QUFDbEQsMkJBQW1CLEVBQUU7QUFDckIsY0FBTSxNQUFNO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixXQUFXLFNBQVMsRUFBRTtBQUFBLFVBQ3RCO0FBQUEsUUFDRDtBQUNBLGFBQUssYUFBYSxJQUFJLEdBQUc7QUFDekIsZUFBTztBQUFBLE1BQ1IsT0FBTztBQUNOLGtCQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU07QUFDaEMsMkJBQW1CLEVBQUUsWUFBWSxFQUFFLE1BQU07QUFDekMsWUFBSSxFQUFFO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsUUFBUSxZQUFvQixRQUE4QjtBQUNqRSxRQUFJLElBQUksS0FBSztBQUNiLFFBQUksa0JBQWtCO0FBRXRCLFdBQU8sTUFBTSxVQUFVO0FBQ3RCLFVBQUksRUFBRSxTQUFTLFlBQVksRUFBRSxXQUFXLGFBQWEsR0FBRztBQUN2RCxZQUFJLEVBQUU7QUFBQSxNQUNQLFdBQVcsRUFBRSxVQUFVLEVBQUUsTUFBTSxjQUFjLGFBQWEsR0FBRztBQUM1RCxjQUFNLHVCQUF1QixLQUFLLG9CQUFvQixHQUFHLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFDbkYsY0FBTSxtQkFBbUIsS0FBSyxvQkFBb0IsR0FBRyxhQUFhLEVBQUUsVUFBVSxDQUFDO0FBQy9FLDJCQUFtQixFQUFFO0FBRXJCLGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLFdBQVcsS0FBSyxJQUFJLHVCQUF1QixTQUFTLEdBQUcsZ0JBQWdCO0FBQUEsVUFDdkU7QUFBQSxRQUNEO0FBQUEsTUFDRCxXQUFXLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLGFBQWEsR0FBRztBQUM5RCxjQUFNLHVCQUF1QixLQUFLLG9CQUFvQixHQUFHLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFDbkYsWUFBSSx1QkFBdUIsU0FBUyxLQUFLLEVBQUUsTUFBTSxRQUFRO0FBQ3hELGlCQUFPO0FBQUEsWUFDTixNQUFNO0FBQUEsWUFDTixXQUFXLHVCQUF1QixTQUFTO0FBQUEsWUFDM0M7QUFBQSxVQUNEO0FBQUEsUUFDRCxPQUFPO0FBQ04sb0JBQVUsRUFBRSxNQUFNLFNBQVM7QUFDM0I7QUFBQSxRQUNEO0FBQUEsTUFDRCxPQUFPO0FBQ04sc0JBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTTtBQUNsQywyQkFBbUIsRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUN6QyxZQUFJLEVBQUU7QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUdBLFFBQUksRUFBRSxLQUFLO0FBQ1gsV0FBTyxNQUFNLFVBQVU7QUFFdEIsVUFBSSxFQUFFLE1BQU0sY0FBYyxHQUFHO0FBQzVCLGNBQU0sbUJBQW1CLEtBQUssb0JBQW9CLEdBQUcsQ0FBQztBQUN0RCxjQUFNQyxtQkFBa0IsS0FBSyxhQUFhLENBQUM7QUFDM0MsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sV0FBVyxLQUFLLElBQUksU0FBUyxHQUFHLGdCQUFnQjtBQUFBLFVBQ2hELGlCQUFBQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixZQUFJLEVBQUUsTUFBTSxVQUFVLFNBQVMsR0FBRztBQUNqQyxnQkFBTUEsbUJBQWtCLEtBQUssYUFBYSxDQUFDO0FBQzNDLGlCQUFPO0FBQUEsWUFDTixNQUFNO0FBQUEsWUFDTixXQUFXLFNBQVM7QUFBQSxZQUNwQixpQkFBQUE7QUFBQSxVQUNEO0FBQUEsUUFDRCxPQUFPO0FBQ04sb0JBQVUsRUFBRSxNQUFNO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBRUEsVUFBSSxFQUFFLEtBQUs7QUFBQSxJQUNaO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGVBQWUsTUFBZ0IsUUFBd0I7QUFDOUQsUUFBSSxLQUFLLE1BQU0sY0FBYyxHQUFHO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLEtBQUssU0FBUyxLQUFLLE1BQU0sV0FBVztBQUNuRCxVQUFNLFlBQVksS0FBSyxlQUFlLEtBQUssTUFBTSxhQUFhLEtBQUssTUFBTSxLQUFLLElBQUk7QUFDbEYsV0FBTyxPQUFPLE9BQU8sV0FBVyxTQUFTO0FBQUEsRUFDMUM7QUFBQSxFQUVRLGFBQWEsTUFBd0I7QUFDNUMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksTUFBTSxLQUFLO0FBQ2YsV0FBTyxTQUFTLEtBQUssTUFBTTtBQUMxQixVQUFJLEtBQUssT0FBTyxVQUFVLE1BQU07QUFDL0IsZUFBTyxLQUFLLE9BQU8sWUFBWSxLQUFLLE9BQU8sTUFBTTtBQUFBLE1BQ2xEO0FBRUEsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBLEVBS1Esa0JBQWtCO0FBQ3pCLFdBQU8sRUFBRSxLQUFLLGtCQUFrQixLQUFLLFNBQVM7QUFBQSxFQUMvQztBQUFBLEVBRVEsWUFBWSxLQUFpQztBQUNwRCxRQUFJLE9BQU8sUUFBUSxVQUFVO0FBQzVCLGFBQU8sSUFBSSxXQUFXLENBQUMsTUFBTTtBQUFBLElBQzlCO0FBRUEsUUFBSSxRQUFRLFlBQVksSUFBSSxNQUFNLGdCQUFnQixHQUFHO0FBQ3BELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxRQUFRLElBQUk7QUFDbEIsVUFBTSxhQUFhLEtBQUssU0FBUyxNQUFNLFdBQVcsRUFBRTtBQUNwRCxVQUFNLE9BQU8sTUFBTSxNQUFNO0FBQ3pCLFVBQU0sY0FBYyxXQUFXLElBQUksSUFBSSxNQUFNLE1BQU07QUFDbkQsUUFBSSxTQUFTLFdBQVcsU0FBUyxHQUFHO0FBRW5DLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxpQkFBaUIsV0FBVyxPQUFPLENBQUM7QUFDMUMsUUFBSSxpQkFBaUIsY0FBYyxHQUFHO0FBQ3JDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFNBQVMsTUFBTSxXQUFXLEVBQUUsT0FBTyxXQUFXLFdBQVcsTUFBTTtBQUFBLEVBQzVFO0FBQUEsRUFFUSxVQUFVLEtBQWlDO0FBQ2xELFFBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUIsYUFBTyxJQUFJLFdBQVcsSUFBSSxTQUFTLENBQUMsTUFBTTtBQUFBLElBQzNDO0FBRUEsUUFBSSxRQUFRLFlBQVksSUFBSSxNQUFNLGdCQUFnQixHQUFHO0FBQ3BELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLGVBQWUsS0FBSyxJQUFJLE1BQU0sU0FBUyxDQUFDLE1BQU07QUFBQSxFQUMzRDtBQUFBLEVBRVEseUJBQXlCLFVBQW9CO0FBQ3BELFFBQUksS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLFlBQVksUUFBUSxHQUFHO0FBQ3pELFlBQU0sT0FBTyxTQUFTLEtBQUs7QUFDM0IsVUFBSSxLQUFLLFVBQVUsSUFBSSxHQUFHO0FBQ3pCLGFBQUssUUFBUSxNQUFNLFFBQVE7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBeUIsTUFBZ0I7QUFDaEQsUUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFDbkQsWUFBTSxXQUFXLEtBQUssS0FBSztBQUMzQixVQUFJLEtBQUssWUFBWSxRQUFRLEdBQUc7QUFDL0IsYUFBSyxRQUFRLE1BQU0sUUFBUTtBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFFBQVEsTUFBZ0IsTUFBZ0I7QUFDL0MsVUFBTSxhQUF5QixDQUFDO0FBRWhDLFVBQU0sYUFBYSxLQUFLLFNBQVMsS0FBSyxNQUFNLFdBQVcsRUFBRTtBQUN6RCxRQUFJO0FBQ0osUUFBSSxLQUFLLE1BQU0sSUFBSSxXQUFXLEdBQUc7QUFFaEMsZUFBUyxFQUFFLE1BQU0sS0FBSyxNQUFNLElBQUksT0FBTyxHQUFHLFFBQVEsV0FBVyxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksV0FBVyxLQUFLLE1BQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFO0FBQUEsSUFDN0gsT0FBTztBQUVOLGVBQVMsRUFBRSxNQUFNLEtBQUssTUFBTSxJQUFJLE1BQU0sUUFBUSxLQUFLLE1BQU0sSUFBSSxTQUFTLEVBQUU7QUFBQSxJQUN6RTtBQUVBLFVBQU0sZ0JBQWdCLEtBQUssTUFBTSxTQUFTO0FBQzFDLFVBQU0sZUFBZSxLQUFLLE1BQU0sY0FBYztBQUM5QyxTQUFLLFFBQVEsSUFBSTtBQUFBLE1BQ2hCLEtBQUssTUFBTTtBQUFBLE1BQ1gsS0FBSyxNQUFNO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixNQUFNLE1BQU0sSUFBSSxFQUFFO0FBQ3JDLFFBQUksS0FBSyxNQUFNLFdBQVcsR0FBRztBQUM1QixpQkFBVyxLQUFLLElBQUk7QUFBQSxJQUNyQjtBQUdBLFVBQU0sV0FBeUIsRUFBRSxNQUFNLEtBQUssTUFBTSxNQUFNLE9BQU8sR0FBRyxRQUFRLEVBQUU7QUFDNUUsVUFBTSxZQUFZLEtBQUssTUFBTSxTQUFTO0FBQ3RDLFVBQU0saUJBQWlCLEtBQUssZUFBZSxLQUFLLE1BQU0sYUFBYSxVQUFVLEtBQUssTUFBTSxHQUFHO0FBQzNGLFNBQUssUUFBUSxJQUFJO0FBQUEsTUFDaEIsS0FBSyxNQUFNO0FBQUEsTUFDWDtBQUFBLE1BQ0EsS0FBSyxNQUFNO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLE1BQU0sTUFBTSxJQUFJLEVBQUU7QUFDckMsUUFBSSxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQzVCLGlCQUFXLEtBQUssSUFBSTtBQUFBLElBQ3JCO0FBR0EsVUFBTSxTQUFTLEtBQUssZ0JBQWdCLE1BQU07QUFDMUMsU0FBSyxjQUFjLE1BQU0sT0FBTyxDQUFDLENBQUM7QUFHbEMsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMzQyxlQUFTLE1BQU0sV0FBVyxDQUFDLENBQUM7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUE2QixPQUFlLE1BQXlCO0FBQzVFLFFBQUksS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLFVBQVUsS0FBSyxHQUFHO0FBQ3BELFlBQU0sV0FBVyxLQUFLLEtBQUs7QUFDM0IsVUFBSSxLQUFLLFlBQVksUUFBUSxHQUFHO0FBRS9CLGlCQUFTO0FBRVQsWUFBSSxTQUFTLE1BQU0sV0FBVyxHQUFHO0FBQ2hDLG1CQUFTLE1BQU0sUUFBUTtBQUFBLFFBQ3hCLE9BQU87QUFFTixnQkFBTSxRQUFRLFNBQVM7QUFDdkIsZ0JBQU0sV0FBeUIsRUFBRSxNQUFNLE1BQU0sTUFBTSxPQUFPLEdBQUcsUUFBUSxFQUFFO0FBQ3ZFLGdCQUFNLFlBQVksTUFBTSxTQUFTO0FBQ2pDLGdCQUFNLGlCQUFpQixLQUFLLGVBQWUsTUFBTSxhQUFhLFVBQVUsTUFBTSxHQUFHO0FBQ2pGLG1CQUFTLFFBQVEsSUFBSTtBQUFBLFlBQ3BCLE1BQU07QUFBQSxZQUNOO0FBQUEsWUFDQSxNQUFNO0FBQUEsWUFDTjtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBRUEsNkJBQW1CLE1BQU0sVUFBVSxJQUFJLEVBQUU7QUFBQSxRQUMxQztBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxRQUFRLE1BQWdCLFVBQWdEO0FBQ3ZFLFFBQUksU0FBUyxVQUFVO0FBQ3RCLGFBQU8sU0FBUyxRQUFRO0FBQUEsSUFDekI7QUFFQSxVQUFNLFVBQVUsS0FBSyxRQUFRLEtBQUssTUFBTSxRQUFRO0FBQ2hELFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLFNBQVMsSUFBSSxLQUFLLEtBQUssUUFBUSxLQUFLLE9BQU8sUUFBUTtBQUFBLEVBQzNEO0FBQUEsRUFFUSxlQUFlLE1BQWdCO0FBQ3RDLFFBQUksU0FBUyxVQUFVO0FBQ3RCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLEtBQUssU0FBUyxLQUFLLE1BQU0sV0FBVztBQUNuRCxVQUFNLFFBQVEsS0FBSztBQUNuQixVQUFNLGNBQWMsS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLEtBQUs7QUFDdEUsVUFBTSxZQUFZLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxHQUFHO0FBQ2xFLFVBQU0saUJBQWlCLE9BQU8sT0FBTyxVQUFVLGFBQWEsU0FBUztBQUNyRSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsZ0JBQWdCLE9BQWM7QUFDN0IsVUFBTSxTQUFTLEtBQUssU0FBUyxNQUFNLFdBQVc7QUFDOUMsVUFBTSxjQUFjLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxLQUFLO0FBQ3RFLFVBQU0sWUFBWSxLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU0sR0FBRztBQUNsRSxVQUFNLGlCQUFpQixPQUFPLE9BQU8sVUFBVSxhQUFhLFNBQVM7QUFDckUsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EsY0FBYyxNQUF1QixHQUFvQjtBQUNoRSxVQUFNLElBQUksSUFBSSxTQUFTLEdBQUcsVUFBVSxHQUFHO0FBQ3ZDLE1BQUUsT0FBTztBQUNULE1BQUUsUUFBUTtBQUNWLE1BQUUsU0FBUztBQUNYLE1BQUUsWUFBWTtBQUNkLE1BQUUsVUFBVTtBQUVaLFVBQU0sSUFBSSxLQUFLO0FBQ2YsUUFBSSxNQUFNLFVBQVU7QUFDbkIsV0FBSyxPQUFPO0FBQ1osUUFBRSxRQUFRLFVBQVU7QUFBQSxJQUNyQixXQUFXLEtBQU0sVUFBVSxVQUFVO0FBQ3BDLFdBQU0sUUFBUTtBQUNkLFFBQUUsU0FBUztBQUFBLElBQ1osT0FBTztBQUNOLFlBQU0sV0FBVyxRQUFRLEtBQU0sS0FBSztBQUNwQyxlQUFTLE9BQU87QUFDaEIsUUFBRSxTQUFTO0FBQUEsSUFDWjtBQUVBLGNBQVUsTUFBTSxDQUFDO0FBQ2pCLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLGFBQWEsTUFBdUIsR0FBb0I7QUFDL0QsVUFBTSxJQUFJLElBQUksU0FBUyxHQUFHLFVBQVUsR0FBRztBQUN2QyxNQUFFLE9BQU87QUFDVCxNQUFFLFFBQVE7QUFDVixNQUFFLFNBQVM7QUFDWCxNQUFFLFlBQVk7QUFDZCxNQUFFLFVBQVU7QUFFWixRQUFJLEtBQUssU0FBUyxVQUFVO0FBQzNCLFdBQUssT0FBTztBQUNaLFFBQUUsUUFBUSxVQUFVO0FBQUEsSUFDckIsV0FBVyxLQUFNLFNBQVMsVUFBVTtBQUNuQyxXQUFNLE9BQU87QUFDYixRQUFFLFNBQVM7QUFBQSxJQUNaLE9BQU87QUFDTixZQUFNLFdBQVcsVUFBVSxLQUFNLElBQUk7QUFDckMsZUFBUyxRQUFRO0FBQ2pCLFFBQUUsU0FBUztBQUFBLElBQ1o7QUFFQSxjQUFVLE1BQU0sQ0FBQztBQUNqQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsb0JBQW9CLE1BQXdCO0FBQ25ELFFBQUksTUFBTTtBQUVWLFNBQUssUUFBUSxNQUFNLENBQUFDLFVBQVE7QUFDMUIsYUFBTyxLQUFLLGVBQWVBLEtBQUk7QUFDL0IsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUE7QUFFRDsiLAogICJuYW1lcyI6IFsiYnVmZmVyIiwgInN0YXJ0T2Zmc2V0IiwgInN0YXJ0Q29sdW1uIiwgInN0YXJ0U3BsaXRQb3NJbkJ1ZmZlciIsICJlbmRTcGxpdFBvc0luQnVmZmVyIiwgImxpbmVTdGFydHMiLCAibm9kZVN0YXJ0T2Zmc2V0IiwgIm5vZGUiXQp9Cg==
