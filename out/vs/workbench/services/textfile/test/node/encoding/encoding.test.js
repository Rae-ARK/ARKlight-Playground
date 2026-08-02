import assert from "assert";
import * as fs from "fs";
import * as encoding from "../../../common/encoding.js";
import * as streams from "../../../../../../base/common/stream.js";
import { newWriteableBufferStream, VSBuffer, streamToBufferReadableStream } from "../../../../../../base/common/buffer.js";
import { splitLines } from "../../../../../../base/common/strings.js";
import { FileAccess } from "../../../../../../base/common/network.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
async function detectEncodingByBOM(file) {
  try {
    const { buffer, bytesRead } = await readExactlyByFile(file, 3);
    return encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);
  } catch (error) {
    return null;
  }
}
function readExactlyByFile(file, totalBytes) {
  return new Promise((resolve, reject) => {
    fs.open(file, "r", null, (err, fd) => {
      if (err) {
        return reject(err);
      }
      function end(err2, resultBuffer, bytesRead) {
        fs.close(fd, (closeError) => {
          if (closeError) {
            return reject(closeError);
          }
          if (err2 && err2.code === "EISDIR") {
            return reject(err2);
          }
          return resolve({ buffer: resultBuffer ? VSBuffer.wrap(resultBuffer) : null, bytesRead });
        });
      }
      const buffer = Buffer.allocUnsafe(totalBytes);
      let offset = 0;
      function readChunk() {
        fs.read(fd, buffer, offset, totalBytes - offset, null, (err2, bytesRead) => {
          if (err2) {
            return end(err2, null, 0);
          }
          if (bytesRead === 0) {
            return end(null, buffer, offset);
          }
          offset += bytesRead;
          if (offset === totalBytes) {
            return end(null, buffer, offset);
          }
          return readChunk();
        });
      }
      readChunk();
    });
  });
}
suite("Encoding", () => {
  test("detectBOM does not return error for non existing file", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/not-exist.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, null);
  });
  test("detectBOM UTF-8", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf8.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, "utf8bom");
  });
  test("detectBOM UTF-16 LE", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16le.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, "utf16le");
  });
  test("detectBOM UTF-16 BE", async () => {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, "utf16be");
  });
  test("detectBOM ANSI", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, null);
  });
  test("detectBOM ANSI (2)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt").fsPath;
    const detectedEncoding = await detectEncodingByBOM(file);
    assert.strictEqual(detectedEncoding, null);
  });
  test("detectEncodingFromBuffer (JSON saved as PNG)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.json.png").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (PNG saved as TXT)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.png.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, true);
  });
  test("detectEncodingFromBuffer (XML saved as PNG)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.xml.png").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (QWOFF saved as TXT)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.qwoff.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, true);
  });
  test("detectEncodingFromBuffer (CSS saved as QWOFF)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.css.qwoff").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (PDF)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.pdf").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.seemsBinary, true);
  });
  test("detectEncodingFromBuffer (guess UTF-16 LE from content without BOM)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_le_nobom.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.encoding, encoding.UTF16le);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("detectEncodingFromBuffer (guess UTF-16 BE from content without BOM)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_be_nobom.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512);
    const mimes = encoding.detectEncodingFromBuffer(buffer);
    assert.strictEqual(mimes.encoding, encoding.UTF16be);
    assert.strictEqual(mimes.seemsBinary, false);
  });
  test("autoGuessEncoding (UTF8)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_file.css").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, "utf8");
  });
  test("autoGuessEncoding (ASCII)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, null);
  });
  test("autoGuessEncoding (ShiftJIS)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, "shiftjis");
  });
  test("autoGuessEncoding (CP1252)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.cp1252.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
    assert.strictEqual(mimes.encoding, "windows1252");
  });
  test("autoGuessEncoding (candidateGuessEncodings - ShiftJIS)", async function() {
    const file = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.1.txt").fsPath;
    const buffer = await readExactlyByFile(file, 512 * 8);
    const mimes = await encoding.detectEncodingFromBuffer(buffer, true, ["utf8", "shiftjis", "eucjp"]);
    assert.strictEqual(mimes.encoding, "shiftjis");
  });
  async function readAndDecodeFromDisk(path, fileEncoding) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js").then((iconv) => iconv.decode(data, encoding.toNodeEncoding(fileEncoding))));
        }
      });
    });
  }
  function newTestReadableStream(buffers) {
    const stream = newWriteableBufferStream();
    buffers.map(VSBuffer.wrap).forEach((buffer) => {
      setTimeout(() => {
        stream.write(buffer);
      });
    });
    setTimeout(() => {
      stream.end();
    });
    return stream;
  }
  async function readAllAsString(stream) {
    return streams.consumeStream(stream, (strings) => strings.join(""));
  }
  test("toDecodeStream - some stream", async function() {
    const source = newTestReadableStream([
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67])
    ]);
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content, "ABCABCABC");
  });
  test("toDecodeStream - some stream, expect too much data", async function() {
    const source = newTestReadableStream([
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67]),
      Buffer.from([65, 66, 67])
    ]);
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content, "ABCABCABC");
  });
  test("toDecodeStream - some stream, no data", async function() {
    const source = newWriteableBufferStream();
    source.end();
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 512, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content, "");
  });
  test("toDecodeStream - encoding, utf16be", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.strictEqual(detected.encoding, "utf16be");
    assert.strictEqual(detected.seemsBinary, false);
    const expected = await readAndDecodeFromDisk(path, detected.encoding);
    const actual = await readAllAsString(stream);
    assert.strictEqual(actual, expected);
  });
  test("toDecodeStream - empty file", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    const expected = await readAndDecodeFromDisk(path, detected.encoding);
    const actual = await readAllAsString(stream);
    assert.strictEqual(actual, expected);
  });
  test("toDecodeStream - decodes buffer entirely", async function() {
    const emojis = Buffer.from("\u{1F5A5}\uFE0F\u{1F4BB}\u{1F4BE}");
    const incompleteEmojis = emojis.slice(0, emojis.length - 1);
    const buffers = [];
    for (let i = 0; i < incompleteEmojis.length; i++) {
      buffers.push(incompleteEmojis.slice(i, i + 1));
    }
    const source = newTestReadableStream(buffers);
    const { stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
    const expected = new TextDecoder().decode(incompleteEmojis);
    const actual = await readAllAsString(stream);
    assert.strictEqual(actual, expected);
  });
  test("toDecodeStream - some stream (GBK issue #101856)", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_gbk.txt").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => "gbk" });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    assert.strictEqual(content.length, 65537);
  });
  test("toDecodeStream - some stream (UTF-8 issue #102202)", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/issue_102202.txt").fsPath;
    const source = streamToBufferReadableStream(fs.createReadStream(path));
    const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => "utf-8" });
    assert.ok(detected);
    assert.ok(stream);
    const content = await readAllAsString(stream);
    const lines = splitLines(content);
    assert.strictEqual(lines[981].toString(), "\u554A\u554A\u554A\u554A\u554A\u554Aaaa\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\uFF0C\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u554A\u3002");
  });
  test("toDecodeStream - binary", async function() {
    const source = () => {
      return newTestReadableStream([
        Buffer.from([0, 0, 0]),
        Buffer.from("Hello World"),
        Buffer.from([0])
      ]);
    };
    let error = void 0;
    try {
      await encoding.toDecodeStream(source(), { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    } catch (e) {
      error = e;
    }
    assert.ok(error instanceof encoding.DecodeStreamError);
    assert.strictEqual(error.decodeStreamErrorKind, encoding.DecodeStreamErrorKind.STREAM_IS_BINARY);
    const { detected, stream } = await encoding.toDecodeStream(source(), { acceptTextOnly: false, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected2) => detected2 || encoding.UTF8 });
    assert.ok(detected);
    assert.strictEqual(detected.seemsBinary, true);
    assert.ok(stream);
  });
  test("toEncodeReadable - encoding, utf16be", async function() {
    const path = FileAccess.asFileUri("vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css").fsPath;
    const source = await readAndDecodeFromDisk(path, encoding.UTF16be);
    const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
    const expected = VSBuffer.wrap(
      iconv.encode(source, encoding.toNodeEncoding(encoding.UTF16be))
    ).toString();
    const actual = streams.consumeReadable(
      await encoding.toEncodeReadable(streams.toReadable(source), encoding.UTF16be),
      VSBuffer.concat
    ).toString();
    assert.strictEqual(actual, expected);
  });
  test("toEncodeReadable - empty readable to utf8", async function() {
    const source = {
      read() {
        return null;
      }
    };
    const actual = streams.consumeReadable(
      await encoding.toEncodeReadable(source, encoding.UTF8),
      VSBuffer.concat
    ).toString();
    assert.strictEqual(actual, "");
  });
  [{
    utfEncoding: encoding.UTF8,
    relatedBom: encoding.UTF8_BOM
  }, {
    utfEncoding: encoding.UTF8_with_bom,
    relatedBom: encoding.UTF8_BOM
  }, {
    utfEncoding: encoding.UTF16be,
    relatedBom: encoding.UTF16be_BOM
  }, {
    utfEncoding: encoding.UTF16le,
    relatedBom: encoding.UTF16le_BOM
  }].forEach(({ utfEncoding, relatedBom }) => {
    test(`toEncodeReadable - empty readable to ${utfEncoding} with BOM`, async function() {
      const source = {
        read() {
          return null;
        }
      };
      const encodedReadable = encoding.toEncodeReadable(source, utfEncoding, { addBOM: true });
      const expected = VSBuffer.wrap(Buffer.from(relatedBom)).toString();
      const actual = streams.consumeReadable(await encodedReadable, VSBuffer.concat).toString();
      assert.strictEqual(actual, expected);
    });
  });
  test("encodingExists", async function() {
    for (const enc in encoding.SUPPORTED_ENCODINGS) {
      if (enc === encoding.UTF8_with_bom) {
        continue;
      }
      const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
      assert.strictEqual(iconv.encodingExists(enc), true, enc);
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
export {
  detectEncodingByBOM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZW5jb2RpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGVuY29kaW5nIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGluZy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJlYW1zIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0sIFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCBzdHJlYW1Ub0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHNwbGl0TGluZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGV0ZWN0RW5jb2RpbmdCeUJPTShmaWxlOiBzdHJpbmcpOiBQcm9taXNlPHR5cGVvZiBlbmNvZGluZy5VVEYxNmJlIHwgdHlwZW9mIGVuY29kaW5nLlVURjE2bGUgfCB0eXBlb2YgZW5jb2RpbmcuVVRGOF93aXRoX2JvbSB8IG51bGw+IHtcblx0dHJ5IHtcblx0XHRjb25zdCB7IGJ1ZmZlciwgYnl0ZXNSZWFkIH0gPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCAzKTtcblxuXHRcdHJldHVybiBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0J5Qk9NRnJvbUJ1ZmZlcihidWZmZXIsIGJ5dGVzUmVhZCk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0cmV0dXJuIG51bGw7IC8vIGlnbm9yZSBlcnJvcnMgKGxpa2UgZmlsZSBub3QgZm91bmQpXG5cdH1cbn1cblxuaW50ZXJmYWNlIFJlYWRSZXN1bHQge1xuXHRidWZmZXI6IFZTQnVmZmVyIHwgbnVsbDtcblx0Ynl0ZXNSZWFkOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHJlYWRFeGFjdGx5QnlGaWxlKGZpbGU6IHN0cmluZywgdG90YWxCeXRlczogbnVtYmVyKTogUHJvbWlzZTxSZWFkUmVzdWx0PiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxSZWFkUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0ZnMub3BlbihmaWxlLCAncicsIG51bGwsIChlcnIsIGZkKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gZW5kKGVycjogRXJyb3IgfCBudWxsLCByZXN1bHRCdWZmZXI6IEJ1ZmZlciB8IG51bGwsIGJ5dGVzUmVhZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRcdGZzLmNsb3NlKGZkLCBjbG9zZUVycm9yID0+IHtcblx0XHRcdFx0XHRpZiAoY2xvc2VFcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlamVjdChjbG9zZUVycm9yKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRpZiAoZXJyICYmICg8YW55PmVycikuY29kZSA9PT0gJ0VJU0RJUicpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTsgLy8gd2Ugd2FudCB0byBidWJibGUgdGhpcyBlcnJvciB1cCAoZmlsZSBpcyBhY3R1YWxseSBhIGZvbGRlcilcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh7IGJ1ZmZlcjogcmVzdWx0QnVmZmVyID8gVlNCdWZmZXIud3JhcChyZXN1bHRCdWZmZXIpIDogbnVsbCwgYnl0ZXNSZWFkIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnVmZmVyID0gQnVmZmVyLmFsbG9jVW5zYWZlKHRvdGFsQnl0ZXMpO1xuXHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cblx0XHRcdGZ1bmN0aW9uIHJlYWRDaHVuaygpOiB2b2lkIHtcblx0XHRcdFx0ZnMucmVhZChmZCwgYnVmZmVyLCBvZmZzZXQsIHRvdGFsQnl0ZXMgLSBvZmZzZXQsIG51bGwsIChlcnIsIGJ5dGVzUmVhZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbmQoZXJyLCBudWxsLCAwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoYnl0ZXNSZWFkID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZW5kKG51bGwsIGJ1ZmZlciwgb2Zmc2V0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvZmZzZXQgKz0gYnl0ZXNSZWFkO1xuXG5cdFx0XHRcdFx0aWYgKG9mZnNldCA9PT0gdG90YWxCeXRlcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVuZChudWxsLCBidWZmZXIsIG9mZnNldCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHJlYWRDaHVuaygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmVhZENodW5rKCk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5zdWl0ZSgnRW5jb2RpbmcnLCAoKSA9PiB7XG5cblx0dGVzdCgnZGV0ZWN0Qk9NIGRvZXMgbm90IHJldHVybiBlcnJvciBmb3Igbm9uIGV4aXN0aW5nIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL25vdC1leGlzdC5jc3MnKS5mc1BhdGg7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShmaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEJPTSBVVEYtOCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZV91dGY4LmNzcycpLmZzUGF0aDtcblxuXHRcdGNvbnN0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKGZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCAndXRmOGJvbScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RCT00gVVRGLTE2IExFJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lX3V0ZjE2bGUuY3NzJykuZnNQYXRoO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00oZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsICd1dGYxNmxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEJPTSBVVEYtMTYgQkUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfdXRmMTZiZS5jc3MnKS5mc1BhdGg7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShmaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgJ3V0ZjE2YmUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0Qk9NIEFOU0knLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfYW5zaS5jc3MnKS5mc1BhdGg7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShmaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdEJPTSBBTlNJICgyKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvZW1wdHkudHh0JykuZnNQYXRoO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00oZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIgKEpTT04gc2F2ZWQgYXMgUE5HKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZS5qc29uLnBuZycpLmZzUGF0aDtcblxuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuc2VlbXNCaW5hcnksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChQTkcgc2F2ZWQgYXMgVFhUKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZS5wbmcudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuc2VlbXNCaW5hcnksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIgKFhNTCBzYXZlZCBhcyBQTkcpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLnhtbC5wbmcnKS5mc1BhdGg7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgNTEyKTtcblx0XHRjb25zdCBtaW1lcyA9IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5zZWVtc0JpbmFyeSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIgKFFXT0ZGIHNhdmVkIGFzIFRYVCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWUucXdvZmYudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuc2VlbXNCaW5hcnksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIgKENTUyBzYXZlZCBhcyBRV09GRiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWUuY3NzLnF3b2ZmJykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuc2VlbXNCaW5hcnksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChQREYpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLnBkZicpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIpO1xuXHRcdGNvbnN0IG1pbWVzID0gZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLnNlZW1zQmluYXJ5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIChndWVzcyBVVEYtMTYgTEUgZnJvbSBjb250ZW50IHdpdGhvdXQgQk9NKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvdXRmMTZfbGVfbm9ib20udHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMik7XG5cdFx0Y29uc3QgbWltZXMgPSBlbmNvZGluZy5kZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoYnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWltZXMuZW5jb2RpbmcsIGVuY29kaW5nLlVURjE2bGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5zZWVtc0JpbmFyeSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIgKGd1ZXNzIFVURi0xNiBCRSBmcm9tIGNvbnRlbnQgd2l0aG91dCBCT00pJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy91dGYxNl9iZV9ub2JvbS50eHQnKS5mc1BhdGg7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgcmVhZEV4YWN0bHlCeUZpbGUoZmlsZSwgNTEyKTtcblx0XHRjb25zdCBtaW1lcyA9IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5lbmNvZGluZywgZW5jb2RpbmcuVVRGMTZiZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLnNlZW1zQmluYXJ5LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9HdWVzc0VuY29kaW5nIChVVEY4KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZV9maWxlLmNzcycpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIgKiA4KTtcblx0XHRjb25zdCBtaW1lcyA9IGF3YWl0IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5lbmNvZGluZywgJ3V0ZjgnKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0d1ZXNzRW5jb2RpbmcgKEFTQ0lJKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZV9hbnNpLmNzcycpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIgKiA4KTtcblx0XHRjb25zdCBtaW1lcyA9IGF3YWl0IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5lbmNvZGluZywgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9HdWVzc0VuY29kaW5nIChTaGlmdEpJUyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWUuc2hpZnRqaXMudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMiAqIDgpO1xuXHRcdGNvbnN0IG1pbWVzID0gYXdhaXQgZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbWVzLmVuY29kaW5nLCAnc2hpZnRqaXMnKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0d1ZXNzRW5jb2RpbmcgKENQMTI1MiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWUuY3AxMjUyLnR4dCcpLmZzUGF0aDtcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZWFkRXhhY3RseUJ5RmlsZShmaWxlLCA1MTIgKiA4KTtcblx0XHRjb25zdCBtaW1lcyA9IGF3YWl0IGVuY29kaW5nLmRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcihidWZmZXIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5lbmNvZGluZywgJ3dpbmRvd3MxMjUyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9HdWVzc0VuY29kaW5nIChjYW5kaWRhdGVHdWVzc0VuY29kaW5ncyAtIFNoaWZ0SklTKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBUaGlzIGZpbGUgaXMgZGV0ZXJtaW5lZCB0byBiZSB3aW5kb3dzMTI1MiB1bmxlc3MgY2FuZGlkYXRlRGV0ZWN0RW5jb2RpbmcgaXMgc2V0LlxuXHRcdGNvbnN0IGZpbGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lLnNoaWZ0amlzLjEudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRFeGFjdGx5QnlGaWxlKGZpbGUsIDUxMiAqIDgpO1xuXHRcdGNvbnN0IG1pbWVzID0gYXdhaXQgZW5jb2RpbmcuZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKGJ1ZmZlciwgdHJ1ZSwgWyd1dGY4JywgJ3NoaWZ0amlzJywgJ2V1Y2pwJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW1lcy5lbmNvZGluZywgJ3NoaWZ0amlzJyk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlYWRBbmREZWNvZGVGcm9tRGlzayhwYXRoOiBzdHJpbmcsIGZpbGVFbmNvZGluZzogc3RyaW5nIHwgbnVsbCkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGZzLnJlYWRGaWxlKHBhdGgsIChlcnIsIGRhdGEpID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJyk+KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJywgJ2xpYi9pY29udi1saXRlLXVtZC5qcycpLnRoZW4oaWNvbnYgPT4gaWNvbnYuZGVjb2RlKGRhdGEsIGVuY29kaW5nLnRvTm9kZUVuY29kaW5nKGZpbGVFbmNvZGluZykpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gbmV3VGVzdFJlYWRhYmxlU3RyZWFtKGJ1ZmZlcnM6IEJ1ZmZlcltdKTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cdFx0YnVmZmVyc1xuXHRcdFx0Lm1hcChWU0J1ZmZlci53cmFwKVxuXHRcdFx0LmZvckVhY2goYnVmZmVyID0+IHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0c3RyZWFtLndyaXRlKGJ1ZmZlcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRzdHJlYW0uZW5kKCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHN0cmVhbTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlYWRBbGxBc1N0cmluZyhzdHJlYW06IHN0cmVhbXMuUmVhZGFibGVTdHJlYW08c3RyaW5nPikge1xuXHRcdHJldHVybiBzdHJlYW1zLmNvbnN1bWVTdHJlYW0oc3RyZWFtLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbignJykpO1xuXHR9XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBzb21lIHN0cmVhbScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXdUZXN0UmVhZGFibGVTdHJlYW0oW1xuXHRcdFx0QnVmZmVyLmZyb20oWzY1LCA2NiwgNjddKSxcblx0XHRcdEJ1ZmZlci5mcm9tKFs2NSwgNjYsIDY3XSksXG5cdFx0XHRCdWZmZXIuZnJvbShbNjUsIDY2LCA2N10pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgeyBkZXRlY3RlZCwgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUsIG1pbkJ5dGVzUmVxdWlyZWRGb3JEZXRlY3Rpb246IDQsIGd1ZXNzRW5jb2Rpbmc6IGZhbHNlLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogW10sIG92ZXJ3cml0ZUVuY29kaW5nOiBhc3luYyBkZXRlY3RlZCA9PiBkZXRlY3RlZCB8fCBlbmNvZGluZy5VVEY4IH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGRldGVjdGVkKTtcblx0XHRhc3NlcnQub2soc3RyZWFtKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkQWxsQXNTdHJpbmcoc3RyZWFtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ0FCQ0FCQ0FCQycpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b0RlY29kZVN0cmVhbSAtIHNvbWUgc3RyZWFtLCBleHBlY3QgdG9vIG11Y2ggZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXdUZXN0UmVhZGFibGVTdHJlYW0oW1xuXHRcdFx0QnVmZmVyLmZyb20oWzY1LCA2NiwgNjddKSxcblx0XHRcdEJ1ZmZlci5mcm9tKFs2NSwgNjYsIDY3XSksXG5cdFx0XHRCdWZmZXIuZnJvbShbNjUsIDY2LCA2N10pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgeyBkZXRlY3RlZCwgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUsIG1pbkJ5dGVzUmVxdWlyZWRGb3JEZXRlY3Rpb246IDY0LCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblxuXHRcdGFzc2VydC5vayhkZXRlY3RlZCk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmVhbSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEFsbEFzU3RyaW5nKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdBQkNBQkNBQkMnKTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBzb21lIHN0cmVhbSwgbm8gZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblx0XHRzb3VyY2UuZW5kKCk7XG5cblx0XHRjb25zdCB7IGRldGVjdGVkLCBzdHJlYW0gfSA9IGF3YWl0IGVuY29kaW5nLnRvRGVjb2RlU3RyZWFtKHNvdXJjZSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSwgbWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbjogNTEyLCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblxuXHRcdGFzc2VydC5vayhkZXRlY3RlZCk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmVhbSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEFsbEFzU3RyaW5nKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICcnKTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBlbmNvZGluZywgdXRmMTZiZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvc29tZV91dGYxNmJlLmNzcycpLmZzUGF0aDtcblx0XHRjb25zdCBzb3VyY2UgPSBzdHJlYW1Ub0J1ZmZlclJlYWRhYmxlU3RyZWFtKGZzLmNyZWF0ZVJlYWRTdHJlYW0ocGF0aCkpO1xuXG5cdFx0Y29uc3QgeyBkZXRlY3RlZCwgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUsIG1pbkJ5dGVzUmVxdWlyZWRGb3JEZXRlY3Rpb246IDY0LCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZC5lbmNvZGluZywgJ3V0ZjE2YmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWQuc2VlbXNCaW5hcnksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYXdhaXQgcmVhZEFuZERlY29kZUZyb21EaXNrKHBhdGgsIGRldGVjdGVkLmVuY29kaW5nKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCByZWFkQWxsQXNTdHJpbmcoc3RyZWFtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRGVjb2RlU3RyZWFtIC0gZW1wdHkgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZml4dHVyZXMvZW1wdHkudHh0JykuZnNQYXRoO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHN0cmVhbVRvQnVmZmVyUmVhZGFibGVTdHJlYW0oZnMuY3JlYXRlUmVhZFN0cmVhbShwYXRoKSk7XG5cdFx0Y29uc3QgeyBkZXRlY3RlZCwgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUsIGd1ZXNzRW5jb2Rpbmc6IGZhbHNlLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogW10sIG92ZXJ3cml0ZUVuY29kaW5nOiBhc3luYyBkZXRlY3RlZCA9PiBkZXRlY3RlZCB8fCBlbmNvZGluZy5VVEY4IH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBhd2FpdCByZWFkQW5kRGVjb2RlRnJvbURpc2socGF0aCwgZGV0ZWN0ZWQuZW5jb2RpbmcpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHJlYWRBbGxBc1N0cmluZyhzdHJlYW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBkZWNvZGVzIGJ1ZmZlciBlbnRpcmVseScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBlbW9qaXMgPSBCdWZmZXIuZnJvbSgnXHVEODNEXHVEREE1XHVGRTBGXHVEODNEXHVEQ0JCXHVEODNEXHVEQ0JFJyk7XG5cdFx0Y29uc3QgaW5jb21wbGV0ZUVtb2ppcyA9IGVtb2ppcy5zbGljZSgwLCBlbW9qaXMubGVuZ3RoIC0gMSk7XG5cblx0XHRjb25zdCBidWZmZXJzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5jb21wbGV0ZUVtb2ppcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YnVmZmVycy5wdXNoKGluY29tcGxldGVFbW9qaXMuc2xpY2UoaSwgaSArIDEpKTtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2UgPSBuZXdUZXN0UmVhZGFibGVTdHJlYW0oYnVmZmVycyk7XG5cdFx0Y29uc3QgeyBzdHJlYW0gfSA9IGF3YWl0IGVuY29kaW5nLnRvRGVjb2RlU3RyZWFtKHNvdXJjZSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSwgbWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbjogNCwgZ3Vlc3NFbmNvZGluZzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBbXSwgb3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jIGRldGVjdGVkID0+IGRldGVjdGVkIHx8IGVuY29kaW5nLlVURjggfSk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShpbmNvbXBsZXRlRW1vamlzKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCByZWFkQWxsQXNTdHJpbmcoc3RyZWFtKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBzb21lIHN0cmVhbSAoR0JLIGlzc3VlICMxMDE4NTYpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9maXh0dXJlcy9zb21lX2diay50eHQnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc291cmNlID0gc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbShmcy5jcmVhdGVSZWFkU3RyZWFtKHBhdGgpKTtcblxuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uOiA0LCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgKCkgPT4gJ2diaycgfSk7XG5cdFx0YXNzZXJ0Lm9rKGRldGVjdGVkKTtcblx0XHRhc3NlcnQub2soc3RyZWFtKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkQWxsQXNTdHJpbmcoc3RyZWFtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC5sZW5ndGgsIDY1NTM3KTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBzb21lIHN0cmVhbSAoVVRGLTggaXNzdWUgIzEwMjIwMiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL2lzc3VlXzEwMjIwMi50eHQnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc291cmNlID0gc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbShmcy5jcmVhdGVSZWFkU3RyZWFtKHBhdGgpKTtcblxuXHRcdGNvbnN0IHsgZGV0ZWN0ZWQsIHN0cmVhbSB9ID0gYXdhaXQgZW5jb2RpbmcudG9EZWNvZGVTdHJlYW0oc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uOiA0LCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgKCkgPT4gJ3V0Zi04JyB9KTtcblx0XHRhc3NlcnQub2soZGV0ZWN0ZWQpO1xuXHRcdGFzc2VydC5vayhzdHJlYW0pO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRBbGxBc1N0cmluZyhzdHJlYW0pO1xuXHRcdGNvbnN0IGxpbmVzID0gc3BsaXRMaW5lcyhjb250ZW50KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc1s5ODFdLnRvU3RyaW5nKCksICdcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFhYWFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdUZGMENcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTU1NEFcdTMwMDInKTtcblx0fSk7XG5cblx0dGVzdCgndG9EZWNvZGVTdHJlYW0gLSBiaW5hcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gKCkgPT4ge1xuXHRcdFx0cmV0dXJuIG5ld1Rlc3RSZWFkYWJsZVN0cmVhbShbXG5cdFx0XHRcdEJ1ZmZlci5mcm9tKFswLCAwLCAwXSksXG5cdFx0XHRcdEJ1ZmZlci5mcm9tKCdIZWxsbyBXb3JsZCcpLFxuXHRcdFx0XHRCdWZmZXIuZnJvbShbMF0pXG5cdFx0XHRdKTtcblx0XHR9O1xuXG5cdFx0Ly8gYWNjZXB0VGV4dE9ubHk6IHRydWVcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGVuY29kaW5nLnRvRGVjb2RlU3RyZWFtKHNvdXJjZSgpLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlLCBndWVzc0VuY29kaW5nOiBmYWxzZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFtdLCBvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWQgPT4gZGV0ZWN0ZWQgfHwgZW5jb2RpbmcuVVRGOCB9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgZW5jb2RpbmcuRGVjb2RlU3RyZWFtRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5kZWNvZGVTdHJlYW1FcnJvcktpbmQsIGVuY29kaW5nLkRlY29kZVN0cmVhbUVycm9yS2luZC5TVFJFQU1fSVNfQklOQVJZKTtcblxuXHRcdC8vIGFjY2VwdFRleHRPbmx5OiBmYWxzZVxuXG5cdFx0Y29uc3QgeyBkZXRlY3RlZCwgc3RyZWFtIH0gPSBhd2FpdCBlbmNvZGluZy50b0RlY29kZVN0cmVhbShzb3VyY2UoKSwgeyBhY2NlcHRUZXh0T25seTogZmFsc2UsIGd1ZXNzRW5jb2Rpbmc6IGZhbHNlLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogW10sIG92ZXJ3cml0ZUVuY29kaW5nOiBhc3luYyBkZXRlY3RlZCA9PiBkZXRlY3RlZCB8fCBlbmNvZGluZy5VVEY4IH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGRldGVjdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWQuc2VlbXNCaW5hcnksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzdHJlYW0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b0VuY29kZVJlYWRhYmxlIC0gZW5jb2RpbmcsIHV0ZjE2YmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9ub2RlL2VuY29kaW5nL2ZpeHR1cmVzL3NvbWVfdXRmMTZiZS5jc3MnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgcmVhZEFuZERlY29kZUZyb21EaXNrKHBhdGgsIGVuY29kaW5nLlVURjE2YmUpO1xuXG5cdFx0Y29uc3QgaWNvbnYgPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnKT4oJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnLCAnbGliL2ljb252LWxpdGUtdW1kLmpzJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFZTQnVmZmVyLndyYXAoXG5cdFx0XHRpY29udi5lbmNvZGUoc291cmNlLCBlbmNvZGluZy50b05vZGVFbmNvZGluZyhlbmNvZGluZy5VVEYxNmJlKSlcblx0XHQpLnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBzdHJlYW1zLmNvbnN1bWVSZWFkYWJsZShcblx0XHRcdGF3YWl0IGVuY29kaW5nLnRvRW5jb2RlUmVhZGFibGUoc3RyZWFtcy50b1JlYWRhYmxlKHNvdXJjZSksIGVuY29kaW5nLlVURjE2YmUpLFxuXHRcdFx0VlNCdWZmZXIuY29uY2F0XG5cdFx0KS50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b0VuY29kZVJlYWRhYmxlIC0gZW1wdHkgcmVhZGFibGUgdG8gdXRmOCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2U6IHN0cmVhbXMuUmVhZGFibGU8c3RyaW5nPiA9IHtcblx0XHRcdHJlYWQoKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBzdHJlYW1zLmNvbnN1bWVSZWFkYWJsZShcblx0XHRcdGF3YWl0IGVuY29kaW5nLnRvRW5jb2RlUmVhZGFibGUoc291cmNlLCBlbmNvZGluZy5VVEY4KSxcblx0XHRcdFZTQnVmZmVyLmNvbmNhdFxuXHRcdCkudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsICcnKTtcblx0fSk7XG5cblx0W3tcblx0XHR1dGZFbmNvZGluZzogZW5jb2RpbmcuVVRGOCxcblx0XHRyZWxhdGVkQm9tOiBlbmNvZGluZy5VVEY4X0JPTVxuXHR9LCB7XG5cdFx0dXRmRW5jb2Rpbmc6IGVuY29kaW5nLlVURjhfd2l0aF9ib20sXG5cdFx0cmVsYXRlZEJvbTogZW5jb2RpbmcuVVRGOF9CT01cblx0fSwge1xuXHRcdHV0ZkVuY29kaW5nOiBlbmNvZGluZy5VVEYxNmJlLFxuXHRcdHJlbGF0ZWRCb206IGVuY29kaW5nLlVURjE2YmVfQk9NLFxuXHR9LCB7XG5cdFx0dXRmRW5jb2Rpbmc6IGVuY29kaW5nLlVURjE2bGUsXG5cdFx0cmVsYXRlZEJvbTogZW5jb2RpbmcuVVRGMTZsZV9CT01cblx0fV0uZm9yRWFjaCgoeyB1dGZFbmNvZGluZywgcmVsYXRlZEJvbSB9KSA9PiB7XG5cdFx0dGVzdChgdG9FbmNvZGVSZWFkYWJsZSAtIGVtcHR5IHJlYWRhYmxlIHRvICR7dXRmRW5jb2Rpbmd9IHdpdGggQk9NYCwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgc291cmNlOiBzdHJlYW1zLlJlYWRhYmxlPHN0cmluZz4gPSB7XG5cdFx0XHRcdHJlYWQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGVuY29kZWRSZWFkYWJsZSA9IGVuY29kaW5nLnRvRW5jb2RlUmVhZGFibGUoc291cmNlLCB1dGZFbmNvZGluZywgeyBhZGRCT006IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gVlNCdWZmZXIud3JhcChCdWZmZXIuZnJvbShyZWxhdGVkQm9tKSkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHN0cmVhbXMuY29uc3VtZVJlYWRhYmxlKGF3YWl0IGVuY29kZWRSZWFkYWJsZSwgVlNCdWZmZXIuY29uY2F0KS50b1N0cmluZygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuY29kaW5nRXhpc3RzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGZvciAoY29uc3QgZW5jIGluIGVuY29kaW5nLlNVUFBPUlRFRF9FTkNPRElOR1MpIHtcblx0XHRcdGlmIChlbmMgPT09IGVuY29kaW5nLlVURjhfd2l0aF9ib20pIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgb3ZlciBlbmNvZGluZ3MgZnJvbSB1c1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWNvbnYgPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnKT4oJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnLCAnbGliL2ljb252LWxpdGUtdW1kLmpzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbnYuZW5jb2RpbmdFeGlzdHMoZW5jKSwgdHJ1ZSwgZW5jKTtcblx0XHR9XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFlBQVksY0FBYztBQUMxQixZQUFZLGFBQWE7QUFDekIsU0FBUywwQkFBMEIsVUFBa0Msb0NBQW9DO0FBQ3pHLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0NBQStDO0FBRXhELGVBQXNCLG9C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
