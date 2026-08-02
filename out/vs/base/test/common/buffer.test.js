import assert from "assert";
import { timeout } from "../../common/async.js";
import { bufferedStreamToBuffer, bufferToReadable, bufferToStream, decodeBase64, decodeHex, encodeBase64, encodeHex, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from "../../common/buffer.js";
import { peekStream } from "../../common/stream.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Buffer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #71993 - VSBuffer#toString returns numbers", () => {
    const data = new Uint8Array([1, 2, 3, "h".charCodeAt(0), "i".charCodeAt(0), 4, 5]).buffer;
    const buffer = VSBuffer.wrap(new Uint8Array(data, 3, 2));
    assert.deepStrictEqual(buffer.toString(), "hi");
  });
  test("issue #251527 - VSBuffer#toString preserves BOM character in filenames", () => {
    const bomChar = "\uFEFF";
    const filename = `${bomChar}c.txt`;
    const buffer = VSBuffer.fromString(filename);
    const result = buffer.toString();
    assert.strictEqual(result, filename);
    assert.strictEqual(result.charCodeAt(0), 65279);
  });
  test("bufferToReadable / readableToBuffer", () => {
    const content = "Hello World";
    const readable = bufferToReadable(VSBuffer.fromString(content));
    assert.strictEqual(readableToBuffer(readable).toString(), content);
  });
  test("bufferToStream / streamToBuffer", async () => {
    const content = "Hello World";
    const stream = bufferToStream(VSBuffer.fromString(content));
    assert.strictEqual((await streamToBuffer(stream)).toString(), content);
  });
  test("bufferedStreamToBuffer", async () => {
    const content = "Hello World";
    const stream = await peekStream(bufferToStream(VSBuffer.fromString(content)), 1);
    assert.strictEqual((await bufferedStreamToBuffer(stream)).toString(), content);
  });
  test("bufferWriteableStream - basics (no error)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(chunks[1].toString(), "World");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - basics (error)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    stream.end();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 1);
  });
  test("bufferWriteableStream - buffers data when no listener", async () => {
    const stream = newWriteableBufferStream();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "HelloWorld");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - buffers errors when no listener", async () => {
    const stream = newWriteableBufferStream();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    stream.end();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 1);
  });
  test("bufferWriteableStream - buffers end when no listener", async () => {
    const stream = newWriteableBufferStream();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "HelloWorld");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - nothing happens after end()", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    let dataCalledAfterEnd = false;
    stream.on("data", (data) => {
      dataCalledAfterEnd = true;
    });
    let errorCalledAfterEnd = false;
    stream.on("error", (error) => {
      errorCalledAfterEnd = true;
    });
    let endCalledAfterEnd = false;
    stream.on("end", () => {
      endCalledAfterEnd = true;
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(dataCalledAfterEnd, false);
    assert.strictEqual(errorCalledAfterEnd, false);
    assert.strictEqual(endCalledAfterEnd, false);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(chunks[1].toString(), "World");
  });
  test("bufferWriteableStream - pause/resume (simple)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    stream.pause();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 0);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(ended, false);
    stream.resume();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "HelloWorld");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - pause/resume (pause after first write)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    stream.pause();
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(ended, false);
    stream.resume();
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(chunks[1].toString(), "World");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 0);
  });
  test("bufferWriteableStream - pause/resume (error)", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    stream.pause();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.error(new Error());
    stream.end();
    assert.strictEqual(chunks.length, 0);
    assert.strictEqual(ended, false);
    assert.strictEqual(errors.length, 0);
    stream.resume();
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].toString(), "Hello");
    assert.strictEqual(ended, true);
    assert.strictEqual(errors.length, 1);
  });
  test("bufferWriteableStream - destroy", async () => {
    const stream = newWriteableBufferStream();
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    let ended = false;
    stream.on("end", () => {
      ended = true;
    });
    const errors = [];
    stream.on("error", (error) => {
      errors.push(error);
    });
    stream.destroy();
    await timeout(0);
    stream.write(VSBuffer.fromString("Hello"));
    await timeout(0);
    stream.end(VSBuffer.fromString("World"));
    assert.strictEqual(chunks.length, 0);
    assert.strictEqual(ended, false);
    assert.strictEqual(errors.length, 0);
  });
  test("Performance issue with VSBuffer#slice #76076", function() {
    if (typeof Buffer !== "undefined") {
      const buff = Buffer.from([10, 20, 30, 40]);
      const b2 = buff.slice(1, 3);
      assert.strictEqual(buff[1], 20);
      assert.strictEqual(b2[0], 20);
      buff[1] = 17;
      assert.strictEqual(buff[1], 17);
      assert.strictEqual(b2[0], 17);
    }
    {
      const unit = new Uint8Array([10, 20, 30, 40]);
      const u2 = unit.slice(1, 3);
      assert.strictEqual(unit[1], 20);
      assert.strictEqual(u2[0], 20);
      unit[1] = 17;
      assert.strictEqual(unit[1], 17);
      assert.strictEqual(u2[0], 20);
    }
    {
      const unit = new Uint8Array([10, 20, 30, 40]);
      const u2 = unit.subarray(1, 3);
      assert.strictEqual(unit[1], 20);
      assert.strictEqual(u2[0], 20);
      unit[1] = 17;
      assert.strictEqual(unit[1], 17);
      assert.strictEqual(u2[0], 17);
    }
  });
  test("indexOf", () => {
    const haystack = VSBuffer.fromString("abcaabbccaaabbbccc");
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("")), 0);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("a".repeat(100))), -1);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("a")), 0);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("c")), 2);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("c"), 4), 7);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("abcaa")), 0);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("caaab")), 8);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("ccc")), 15);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("cc"), 9), 15);
    assert.strictEqual(haystack.indexOf(VSBuffer.fromString("cccb")), -1);
  });
  test("wrap", () => {
    const actual = new Uint8Array([1, 2, 3]);
    const wrapped = VSBuffer.wrap(actual);
    assert.strictEqual(wrapped.byteLength, 3);
    assert.deepStrictEqual(Array.from(wrapped.buffer), [1, 2, 3]);
  });
  test("fromString", () => {
    const value = "Hello World";
    const buff = VSBuffer.fromString(value);
    assert.strictEqual(buff.toString(), value);
  });
  test("fromByteArray", () => {
    const array = [1, 2, 3, 4, 5];
    const buff = VSBuffer.fromByteArray(array);
    assert.strictEqual(buff.byteLength, array.length);
    assert.deepStrictEqual(Array.from(buff.buffer), array);
  });
  test("concat", () => {
    const chunks = [
      VSBuffer.fromString("abc"),
      VSBuffer.fromString("def"),
      VSBuffer.fromString("ghi")
    ];
    const result1 = VSBuffer.concat(chunks);
    assert.strictEqual(result1.toString(), "abcdefghi");
    const result2 = VSBuffer.concat(chunks, 9);
    assert.strictEqual(result2.toString(), "abcdefghi");
  });
  test("clone", () => {
    const original = VSBuffer.fromString("test");
    const clone = original.clone();
    assert.notStrictEqual(original.buffer, clone.buffer);
    assert.deepStrictEqual(Array.from(original.buffer), Array.from(clone.buffer));
  });
  test("slice", () => {
    const buff = VSBuffer.fromString("Hello World");
    const slice1 = buff.slice(0, 5);
    assert.strictEqual(slice1.toString(), "Hello");
    const slice2 = buff.slice(6);
    assert.strictEqual(slice2.toString(), "World");
  });
  test("set", () => {
    const buff = VSBuffer.alloc(5);
    buff.set(VSBuffer.fromString("ab"), 0);
    assert.strictEqual(buff.toString().substring(0, 2), "ab");
    buff.set(new Uint8Array([99, 100]), 2);
    assert.strictEqual(buff.toString().substring(2, 4), "cd");
    assert.throws(() => {
      buff.set({});
    });
  });
  test("equals", () => {
    const buff1 = VSBuffer.fromString("test");
    const buff2 = VSBuffer.fromString("test");
    const buff3 = VSBuffer.fromString("different");
    const buff4 = VSBuffer.fromString("tes1");
    assert.strictEqual(buff1.equals(buff1), true);
    assert.strictEqual(buff1.equals(buff2), true);
    assert.strictEqual(buff1.equals(buff3), false);
    assert.strictEqual(buff1.equals(buff4), false);
  });
  test("read/write methods", () => {
    const buff = VSBuffer.alloc(8);
    buff.writeUInt32BE(305419896, 0);
    assert.strictEqual(buff.readUInt32BE(0), 305419896);
    buff.writeUInt32LE(305419896, 4);
    assert.strictEqual(buff.readUInt32LE(4), 305419896);
    const buff2 = VSBuffer.alloc(1);
    buff2.writeUInt8(123, 0);
    assert.strictEqual(buff2.readUInt8(0), 123);
  });
  suite("encoding", () => {
    const testCases = [
      [new Uint8Array([]), "", ""],
      [new Uint8Array([77]), "TQ==", "4d"],
      [new Uint8Array([230, 138]), "5oo=", "e68a"],
      [new Uint8Array([104, 98, 82]), "aGJS", "686252"],
      [new Uint8Array([92, 114, 57, 209]), "XHI50Q==", "5c7239d1"],
      [new Uint8Array([238, 51, 1, 240, 124]), "7jMB8Hw=", "ee3301f07c"],
      [new Uint8Array([96, 54, 130, 79, 47, 179]), "YDaCTy+z", "6036824f2fb3"],
      [new Uint8Array([91, 22, 68, 217, 68, 117, 116]), "WxZE2UR1dA==", "5b1644d9447574"],
      [new Uint8Array([184, 227, 214, 171, 244, 175, 141, 53]), "uOPWq/SvjTU=", "b8e3d6abf4af8d35"],
      [new Uint8Array([53, 98, 93, 130, 71, 117, 191, 137, 156]), "NWJdgkd1v4mc", "35625d824775bf899c"],
      [new Uint8Array([154, 156, 60, 102, 232, 197, 92, 25, 124, 98]), "mpw8ZujFXBl8Yg==", "9a9c3c66e8c55c197c62"],
      [new Uint8Array([152, 131, 106, 234, 17, 183, 164, 245, 252, 67, 26]), "mINq6hG3pPX8Qxo=", "98836aea11b7a4f5fc431a"],
      [new Uint8Array([232, 254, 194, 234, 16, 42, 86, 135, 117, 61, 179, 4]), "6P7C6hAqVod1PbME", "e8fec2ea102a5687753db304"],
      [new Uint8Array([4, 199, 85, 172, 125, 171, 172, 219, 61, 47, 78, 155, 127]), "BMdVrH2rrNs9L06bfw==", "04c755ac7dabacdb3d2f4e9b7f"],
      [new Uint8Array([189, 67, 62, 189, 87, 171, 27, 164, 87, 142, 126, 113, 23, 182]), "vUM+vVerG6RXjn5xF7Y=", "bd433ebd57ab1ba4578e7e7117b6"],
      [new Uint8Array([153, 156, 145, 240, 228, 200, 199, 158, 40, 167, 97, 52, 217, 148, 43]), "mZyR8OTIx54op2E02ZQr", "999c91f0e4c8c79e28a76134d9942b"]
    ];
    test("encodes base64", () => {
      for (const [bytes, expected] of testCases) {
        assert.strictEqual(encodeBase64(VSBuffer.wrap(bytes)), expected);
      }
    });
    test("decodes, base64", () => {
      for (const [expected, encoded] of testCases) {
        assert.deepStrictEqual(new Uint8Array(decodeBase64(encoded).buffer), expected);
      }
    });
    test("encodes hex", () => {
      for (const [bytes, , expected] of testCases) {
        assert.strictEqual(encodeHex(VSBuffer.wrap(bytes)), expected);
      }
    });
    test("decodes, hex", () => {
      for (const [expected, , encoded] of testCases) {
        assert.deepStrictEqual(new Uint8Array(decodeHex(encoded).buffer), expected);
      }
    });
    test("throws error on invalid encoding", () => {
      assert.throws(() => decodeBase64("invalid!"));
      assert.throws(() => decodeHex("invalid!"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vYnVmZmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGJ1ZmZlcmVkU3RyZWFtVG9CdWZmZXIsIGJ1ZmZlclRvUmVhZGFibGUsIGJ1ZmZlclRvU3RyZWFtLCBkZWNvZGVCYXNlNjQsIGRlY29kZUhleCwgZW5jb2RlQmFzZTY0LCBlbmNvZGVIZXgsIG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSwgcmVhZGFibGVUb0J1ZmZlciwgc3RyZWFtVG9CdWZmZXIsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBwZWVrU3RyZWFtIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0J1ZmZlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzE5OTMgLSBWU0J1ZmZlciN0b1N0cmluZyByZXR1cm5zIG51bWJlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzLCAnaCcuY2hhckNvZGVBdCgwKSwgJ2knLmNoYXJDb2RlQXQoMCksIDQsIDVdKS5idWZmZXI7XG5cdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShkYXRhLCAzLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWZmZXIudG9TdHJpbmcoKSwgJ2hpJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNTE1MjcgLSBWU0J1ZmZlciN0b1N0cmluZyBwcmVzZXJ2ZXMgQk9NIGNoYXJhY3RlciBpbiBmaWxlbmFtZXMnLCAoKSA9PiB7XG5cdFx0Ly8gQk9NIGNoYXJhY3RlciAoVStGRUZGKSBpcyBhIHplcm8td2lkdGggY2hhcmFjdGVyIHRoYXQgd2FzIGJlaW5nIHN0cmlwcGVkXG5cdFx0Ly8gd2hlbiBkZXNlcmlhbGl6aW5nIG1lc3NhZ2VzIGluIHRoZSBJUEMgbGF5ZXIuIFRoaXMgdGVzdCB2ZXJpZmllcyB0aGF0XG5cdFx0Ly8gdGhlIEJPTSBjaGFyYWN0ZXIgaXMgcHJlc2VydmVkIHdoZW4gdXNpbmcgVlNCdWZmZXIudG9TdHJpbmcoKS5cblx0XHRjb25zdCBib21DaGFyID0gJ1xcdUZFRkYnO1xuXHRcdGNvbnN0IGZpbGVuYW1lID0gYCR7Ym9tQ2hhcn1jLnR4dGA7XG5cdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZyhmaWxlbmFtZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVmZmVyLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIEJPTSBjaGFyYWN0ZXIgaXMgcHJlc2VydmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmlsZW5hbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2hhckNvZGVBdCgwKSwgMHhGRUZGKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyVG9SZWFkYWJsZSAvIHJlYWRhYmxlVG9CdWZmZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3QgcmVhZGFibGUgPSBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRhYmxlVG9CdWZmZXIocmVhZGFibGUpLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJUb1N0cmVhbSAvIHN0cmVhbVRvQnVmZmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnSGVsbG8gV29ybGQnO1xuXHRcdGNvbnN0IHN0cmVhbSA9IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzdHJlYW1Ub0J1ZmZlcihzdHJlYW0pKS50b1N0cmluZygpLCBjb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyZWRTdHJlYW1Ub0J1ZmZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCBzdHJlYW0gPSBhd2FpdCBwZWVrU3RyZWFtKGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgYnVmZmVyZWRTdHJlYW1Ub0J1ZmZlcihzdHJlYW0pKS50b1N0cmluZygpLCBjb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gYmFzaWNzIChubyBlcnJvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ1dvcmxkJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0udG9TdHJpbmcoKSwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1sxXS50b1N0cmluZygpLCAnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gYmFzaWNzIChlcnJvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdHN0cmVhbS5lbmQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBidWZmZXJzIGRhdGEgd2hlbiBubyBsaXN0ZW5lcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdXb3JsZCcpKTtcblxuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZGVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG9Xb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBidWZmZXJzIGVycm9ycyB3aGVuIG5vIGxpc3RlbmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZGVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHN0cmVhbS5lbmQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBidWZmZXJzIGVuZCB3aGVuIG5vIGxpc3RlbmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ1dvcmxkJykpO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdGVycm9ycy5wdXNoKGVycm9yKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsb1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcldyaXRlYWJsZVN0cmVhbSAtIG5vdGhpbmcgaGFwcGVucyBhZnRlciBlbmQoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnV29ybGQnKSk7XG5cblx0XHRsZXQgZGF0YUNhbGxlZEFmdGVyRW5kID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRkYXRhQ2FsbGVkQWZ0ZXJFbmQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVycm9yQ2FsbGVkQWZ0ZXJFbmQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JDYWxsZWRBZnRlckVuZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kQ2FsbGVkQWZ0ZXJFbmQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZENhbGxlZEFmdGVyRW5kID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnV29ybGQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YUNhbGxlZEFmdGVyRW5kLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yQ2FsbGVkQWZ0ZXJFbmQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kQ2FsbGVkQWZ0ZXJFbmQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMV0udG9TdHJpbmcoKSwgJ1dvcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcldyaXRlYWJsZVN0cmVhbSAtIHBhdXNlL3Jlc3VtZSAoc2ltcGxlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZGVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRzdHJlYW0ucGF1c2UoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c3RyZWFtLmVuZChWU0J1ZmZlci5mcm9tU3RyaW5nKCdXb3JsZCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZGVkLCBmYWxzZSk7XG5cblx0XHRzdHJlYW0ucmVzdW1lKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXS50b1N0cmluZygpLCAnSGVsbG9Xb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBwYXVzZS9yZXN1bWUgKHBhdXNlIGFmdGVyIGZpcnN0IHdyaXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblxuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZGVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblxuXHRcdHN0cmVhbS5wYXVzZSgpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoJ1dvcmxkJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0udG9TdHJpbmcoKSwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLnJlc3VtZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0udG9TdHJpbmcoKSwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1sxXS50b1N0cmluZygpLCAnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyV3JpdGVhYmxlU3RyZWFtIC0gcGF1c2UvcmVzdW1lIChlcnJvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRjb25zdCBjaHVua3M6IFZTQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0c3RyZWFtLnBhdXNlKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0c3RyZWFtLmVuZCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblxuXHRcdHN0cmVhbS5yZXN1bWUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzBdLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJXcml0ZWFibGVTdHJlYW0gLSBkZXN0cm95JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHR9KTtcblxuXHRcdGxldCBlbmRlZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdGVycm9ycy5wdXNoKGVycm9yKTtcblx0XHR9KTtcblxuXHRcdHN0cmVhbS5kZXN0cm95KCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbycpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHN0cmVhbS5lbmQoVlNCdWZmZXIuZnJvbVN0cmluZygnV29ybGQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdQZXJmb3JtYW5jZSBpc3N1ZSB3aXRoIFZTQnVmZmVyI3NsaWNlICM3NjA3NicsIGZ1bmN0aW9uICgpIHsgLy8gVE9ET0BhbGV4ZGltYSB0aGlzIHRlc3Qgc2VlbXMgdG8gZmFpbCBpbiB3ZWIgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTQwNDIpXG5cdFx0Ly8gQnVmZmVyI3NsaWNlIGNyZWF0ZXMgYSB2aWV3XG5cdFx0aWYgKHR5cGVvZiBCdWZmZXIgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb25zdCBidWZmID0gQnVmZmVyLmZyb20oWzEwLCAyMCwgMzAsIDQwXSk7XG5cdFx0XHRjb25zdCBiMiA9IGJ1ZmYuc2xpY2UoMSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZlsxXSwgMjApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIyWzBdLCAyMCk7XG5cblx0XHRcdGJ1ZmZbMV0gPSAxNzsgLy8gbW9kaWZ5IGJ1ZmYgQU5EIGIyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZlsxXSwgMTcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIyWzBdLCAxNyk7XG5cdFx0fVxuXG5cdFx0Ly8gVHlwZWRBcnJheSNzbGljZSBjcmVhdGVzIGEgY29weVxuXHRcdHtcblx0XHRcdGNvbnN0IHVuaXQgPSBuZXcgVWludDhBcnJheShbMTAsIDIwLCAzMCwgNDBdKTtcblx0XHRcdGNvbnN0IHUyID0gdW5pdC5zbGljZSgxLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bml0WzFdLCAyMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodTJbMF0sIDIwKTtcblxuXHRcdFx0dW5pdFsxXSA9IDE3OyAvLyBtb2RpZnkgdW5pdCwgTk9UIGIyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pdFsxXSwgMTcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHUyWzBdLCAyMCk7XG5cdFx0fVxuXG5cdFx0Ly8gVHlwZWRBcnJheSNzdWJhcnJheSBjcmVhdGVzIGEgdmlld1xuXHRcdHtcblx0XHRcdGNvbnN0IHVuaXQgPSBuZXcgVWludDhBcnJheShbMTAsIDIwLCAzMCwgNDBdKTtcblx0XHRcdGNvbnN0IHUyID0gdW5pdC5zdWJhcnJheSgxLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bml0WzFdLCAyMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodTJbMF0sIDIwKTtcblxuXHRcdFx0dW5pdFsxXSA9IDE3OyAvLyBtb2RpZnkgdW5pdCBBTkQgYjJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bml0WzFdLCAxNyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodTJbMF0sIDE3KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2luZGV4T2YnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGF5c3RhY2sgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYmNhYWJiY2NhYWFiYmJjY2MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2EnLnJlcGVhdCgxMDApKSksIC0xKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2EnKSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2MnKSksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2MnKSwgNCksIDcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhheXN0YWNrLmluZGV4T2YoVlNCdWZmZXIuZnJvbVN0cmluZygnYWJjYWEnKSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXlzdGFjay5pbmRleE9mKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2NhYWFiJykpLCA4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdjY2MnKSksIDE1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGF5c3RhY2suaW5kZXhPZihWU0J1ZmZlci5mcm9tU3RyaW5nKCdjYycpLCA5KSwgMTUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhheXN0YWNrLmluZGV4T2YoVlNCdWZmZXIuZnJvbVN0cmluZygnY2NjYicpKSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cmFwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IFZTQnVmZmVyLndyYXAoYWN0dWFsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBlZC5ieXRlTGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20od3JhcHBlZC5idWZmZXIpLCBbMSwgMiwgM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdmcm9tU3RyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYudG9TdHJpbmcoKSwgdmFsdWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmcm9tQnl0ZUFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFycmF5ID0gWzEsIDIsIDMsIDQsIDVdO1xuXHRcdGNvbnN0IGJ1ZmYgPSBWU0J1ZmZlci5mcm9tQnl0ZUFycmF5KGFycmF5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZi5ieXRlTGVuZ3RoLCBhcnJheS5sZW5ndGgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShidWZmLmJ1ZmZlciksIGFycmF5KTtcblx0fSk7XG5cblx0dGVzdCgnY29uY2F0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNodW5rcyA9IFtcblx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiYycpLFxuXHRcdFx0VlNCdWZmZXIuZnJvbVN0cmluZygnZGVmJyksXG5cdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKCdnaGknKVxuXHRcdF07XG5cblx0XHQvLyBUZXN0IHdpdGhvdXQgdG90YWwgbGVuZ3RoXG5cdFx0Y29uc3QgcmVzdWx0MSA9IFZTQnVmZmVyLmNvbmNhdChjaHVua3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLnRvU3RyaW5nKCksICdhYmNkZWZnaGknKTtcblxuXHRcdC8vIFRlc3Qgd2l0aCB0b3RhbCBsZW5ndGhcblx0XHRjb25zdCByZXN1bHQyID0gVlNCdWZmZXIuY29uY2F0KGNodW5rcywgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIudG9TdHJpbmcoKSwgJ2FiY2RlZmdoaScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9uZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKTtcblx0XHRjb25zdCBjbG9uZSA9IG9yaWdpbmFsLmNsb25lKCk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwob3JpZ2luYWwuYnVmZmVyLCBjbG9uZS5idWZmZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShvcmlnaW5hbC5idWZmZXIpLCBBcnJheS5mcm9tKGNsb25lLmJ1ZmZlcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbGljZScsICgpID0+IHtcblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gV29ybGQnKTtcblxuXHRcdGNvbnN0IHNsaWNlMSA9IGJ1ZmYuc2xpY2UoMCwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsaWNlMS50b1N0cmluZygpLCAnSGVsbG8nKTtcblxuXHRcdGNvbnN0IHNsaWNlMiA9IGJ1ZmYuc2xpY2UoNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsaWNlMi50b1N0cmluZygpLCAnV29ybGQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1ZmYgPSBWU0J1ZmZlci5hbGxvYyg1KTtcblxuXHRcdC8vIFRlc3Qgc2V0dGluZyBmcm9tIFZTQnVmZmVyXG5cdFx0YnVmZi5zZXQoVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYudG9TdHJpbmcoKS5zdWJzdHJpbmcoMCwgMiksICdhYicpO1xuXG5cdFx0Ly8gVGVzdCBzZXR0aW5nIGZyb20gVWludDhBcnJheVxuXHRcdGJ1ZmYuc2V0KG5ldyBVaW50OEFycmF5KFs5OSwgMTAwXSksIDIpOyAvLyAnY2QnXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYudG9TdHJpbmcoKS5zdWJzdHJpbmcoMiwgNCksICdjZCcpO1xuXG5cdFx0Ly8gVGVzdCBpbnZhbGlkIGlucHV0XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGJ1ZmYuc2V0KHt9IGFzIGFueSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VxdWFscycsICgpID0+IHtcblx0XHRjb25zdCBidWZmMSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKTtcblx0XHRjb25zdCBidWZmMiA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKTtcblx0XHRjb25zdCBidWZmMyA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2RpZmZlcmVudCcpO1xuXHRcdGNvbnN0IGJ1ZmY0ID0gVlNCdWZmZXIuZnJvbVN0cmluZygndGVzMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYxLmVxdWFscyhidWZmMSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmMS5lcXVhbHMoYnVmZjIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZjEuZXF1YWxzKGJ1ZmYzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmMS5lcXVhbHMoYnVmZjQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQvd3JpdGUgbWV0aG9kcycsICgpID0+IHtcblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuYWxsb2MoOCk7XG5cblx0XHQvLyBUZXN0IFVJbnQzMkJFXG5cdFx0YnVmZi53cml0ZVVJbnQzMkJFKDB4MTIzNDU2NzgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmLnJlYWRVSW50MzJCRSgwKSwgMHgxMjM0NTY3OCk7XG5cblx0XHQvLyBUZXN0IFVJbnQzMkxFXG5cdFx0YnVmZi53cml0ZVVJbnQzMkxFKDB4MTIzNDU2NzgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmLnJlYWRVSW50MzJMRSg0KSwgMHgxMjM0NTY3OCk7XG5cblx0XHQvLyBUZXN0IFVJbnQ4XG5cdFx0Y29uc3QgYnVmZjIgPSBWU0J1ZmZlci5hbGxvYygxKTtcblx0XHRidWZmMi53cml0ZVVJbnQ4KDEyMywgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmYyLnJlYWRVSW50OCgwKSwgMTIzKTtcblx0fSk7XG5cblx0c3VpdGUoJ2VuY29kaW5nJywgKCkgPT4ge1xuXHRcdC8qXG5cdFx0R2VuZXJhdGVkIHdpdGg6XG5cblx0XHRjb25zdCBjcnlwdG8gPSByZXF1aXJlKCdjcnlwdG8nKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTY7IGkrKykge1xuXHRcdFx0Y29uc3QgYnVmID0gIGNyeXB0by5yYW5kb21CeXRlcyhpKTtcblx0XHRcdGNvbnNvbGUubG9nKGBbbmV3IFVpbnQ4QXJyYXkoWyR7QXJyYXkuZnJvbShidWYpLmpvaW4oJywgJyl9XSksICcke2J1Zi50b1N0cmluZygnYmFzZTY0Jyl9J10sYClcblx0XHR9XG5cblx0XHQqL1xuXG5cdFx0Y29uc3QgdGVzdENhc2VzOiBbVWludDhBcnJheSwgYmFzZTY0OiBzdHJpbmcsIGhleDogc3RyaW5nXVtdID0gW1xuXHRcdFx0W25ldyBVaW50OEFycmF5KFtdKSwgJycsICcnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbNzddKSwgJ1RRPT0nLCAnNGQnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMjMwLCAxMzhdKSwgJzVvbz0nLCAnZTY4YSddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFsxMDQsIDk4LCA4Ml0pLCAnYUdKUycsICc2ODYyNTInXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbOTIsIDExNCwgNTcsIDIwOV0pLCAnWEhJNTBRPT0nLCAnNWM3MjM5ZDEnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMjM4LCA1MSwgMSwgMjQwLCAxMjRdKSwgJzdqTUI4SHc9JywgJ2VlMzMwMWYwN2MnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbOTYsIDU0LCAxMzAsIDc5LCA0NywgMTc5XSksICdZRGFDVHkreicsICc2MDM2ODI0ZjJmYjMnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbOTEsIDIyLCA2OCwgMjE3LCA2OCwgMTE3LCAxMTZdKSwgJ1d4WkUyVVIxZEE9PScsICc1YjE2NDRkOTQ0NzU3NCddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFsxODQsIDIyNywgMjE0LCAxNzEsIDI0NCwgMTc1LCAxNDEsIDUzXSksICd1T1BXcS9TdmpUVT0nLCAnYjhlM2Q2YWJmNGFmOGQzNSddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFs1MywgOTgsIDkzLCAxMzAsIDcxLCAxMTcsIDE5MSwgMTM3LCAxNTZdKSwgJ05XSmRna2QxdjRtYycsICczNTYyNWQ4MjQ3NzViZjg5OWMnXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMTU0LCAxNTYsIDYwLCAxMDIsIDIzMiwgMTk3LCA5MiwgMjUsIDEyNCwgOThdKSwgJ21wdzhadWpGWEJsOFlnPT0nLCAnOWE5YzNjNjZlOGM1NWMxOTdjNjInXSxcblx0XHRcdFtuZXcgVWludDhBcnJheShbMTUyLCAxMzEsIDEwNiwgMjM0LCAxNywgMTgzLCAxNjQsIDI0NSwgMjUyLCA2NywgMjZdKSwgJ21JTnE2aEczcFBYOFF4bz0nLCAnOTg4MzZhZWExMWI3YTRmNWZjNDMxYSddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFsyMzIsIDI1NCwgMTk0LCAyMzQsIDE2LCA0MiwgODYsIDEzNSwgMTE3LCA2MSwgMTc5LCA0XSksICc2UDdDNmhBcVZvZDFQYk1FJywgJ2U4ZmVjMmVhMTAyYTU2ODc3NTNkYjMwNCddLFxuXHRcdFx0W25ldyBVaW50OEFycmF5KFs0LCAxOTksIDg1LCAxNzIsIDEyNSwgMTcxLCAxNzIsIDIxOSwgNjEsIDQ3LCA3OCwgMTU1LCAxMjddKSwgJ0JNZFZySDJyck5zOUwwNmJmdz09JywgJzA0Yzc1NWFjN2RhYmFjZGIzZDJmNGU5YjdmJ10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzE4OSwgNjcsIDYyLCAxODksIDg3LCAxNzEsIDI3LCAxNjQsIDg3LCAxNDIsIDEyNiwgMTEzLCAyMywgMTgyXSksICd2VU0rdlZlckc2UlhqbjV4RjdZPScsICdiZDQzM2ViZDU3YWIxYmE0NTc4ZTdlNzExN2I2J10sXG5cdFx0XHRbbmV3IFVpbnQ4QXJyYXkoWzE1MywgMTU2LCAxNDUsIDI0MCwgMjI4LCAyMDAsIDE5OSwgMTU4LCA0MCwgMTY3LCA5NywgNTIsIDIxNywgMTQ4LCA0M10pLCAnbVp5UjhPVEl4NTRvcDJFMDJaUXInLCAnOTk5YzkxZjBlNGM4Yzc5ZTI4YTc2MTM0ZDk5NDJiJ10sXG5cdFx0XTtcblxuXHRcdHRlc3QoJ2VuY29kZXMgYmFzZTY0JywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbYnl0ZXMsIGV4cGVjdGVkXSBvZiB0ZXN0Q2FzZXMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKGJ5dGVzKSksIGV4cGVjdGVkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlY29kZXMsIGJhc2U2NCcsICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2V4cGVjdGVkLCBlbmNvZGVkXSBvZiB0ZXN0Q2FzZXMpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXcgVWludDhBcnJheShkZWNvZGVCYXNlNjQoZW5jb2RlZCkuYnVmZmVyKSwgZXhwZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5jb2RlcyBoZXgnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtieXRlcywgLCBleHBlY3RlZF0gb2YgdGVzdENhc2VzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNvZGVIZXgoVlNCdWZmZXIud3JhcChieXRlcykpLCBleHBlY3RlZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWNvZGVzLCBoZXgnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtleHBlY3RlZCwgLCBlbmNvZGVkXSBvZiB0ZXN0Q2FzZXMpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXcgVWludDhBcnJheShkZWNvZGVIZXgoZW5jb2RlZCkuYnVmZmVyKSwgZXhwZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIGVycm9yIG9uIGludmFsaWQgZW5jb2RpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGRlY29kZUJhc2U2NCgnaW52YWxpZCEnKSk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGRlY29kZUhleCgnaW52YWxpZCEnKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCLGtCQUFrQixnQkFBZ0IsY0FBYyxXQUFXLGNBQWMsV0FBVywwQkFBMEIsa0JBQWtCLGdCQUFnQixnQkFBZ0I7QUFDak0sU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxVQUFVLE1BQU07QUFFckIsMENBQXdDO0FBRXhDLE9BQUssb0RBQW9ELE1BQU07QUFDOUQsVUFBTSxPQUFPLElBQUksV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksV0FBVyxDQUFDLEdBQUcsSUFBSSxXQUFXLENBQUMsR0FBRyxHQUFH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
