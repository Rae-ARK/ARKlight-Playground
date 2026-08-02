import assert from "assert";
import { timeout } from "../../common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { bufferToReadable, VSBuffer } from "../../common/buffer.js";
import { CancellationTokenSource } from "../../common/cancellation.js";
import { consumeReadable, consumeStream, isReadable, isReadableBufferedStream, isReadableStream, listenStream, newWriteableStream, peekReadable, peekStream, prefixedReadable, prefixedStream, toReadable, toStream, transform } from "../../common/stream.js";
suite("Stream", () => {
  test("isReadable", () => {
    assert.ok(!isReadable(void 0));
    assert.ok(!isReadable(/* @__PURE__ */ Object.create(null)));
    assert.ok(isReadable(bufferToReadable(VSBuffer.fromString(""))));
  });
  test("isReadableStream", () => {
    assert.ok(!isReadableStream(void 0));
    assert.ok(!isReadableStream(/* @__PURE__ */ Object.create(null)));
    assert.ok(isReadableStream(newWriteableStream((d) => d)));
  });
  test("isReadableBufferedStream", async () => {
    assert.ok(!isReadableBufferedStream(/* @__PURE__ */ Object.create(null)));
    const stream = newWriteableStream((d) => d);
    stream.end();
    const bufferedStream = await peekStream(stream, 1);
    assert.ok(isReadableBufferedStream(bufferedStream));
  });
  test("WriteableStream - basics", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    stream.on("error", (e) => {
      error = true;
    });
    let end = false;
    stream.on("end", () => {
      end = true;
    });
    stream.write("Hello");
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    assert.strictEqual(chunks[0], "Hello");
    stream.write("World");
    assert.strictEqual(chunks[1], "World");
    assert.strictEqual(error, false);
    assert.strictEqual(end, false);
    stream.pause();
    stream.write("1");
    stream.write("2");
    stream.write("3");
    assert.strictEqual(chunks.length, 2);
    stream.resume();
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[2], "1,2,3");
    stream.error(new Error());
    assert.strictEqual(error, true);
    error = false;
    stream.error(new Error());
    assert.strictEqual(error, true);
    stream.end("Final Bit");
    assert.strictEqual(chunks.length, 4);
    assert.strictEqual(chunks[3], "Final Bit");
    assert.strictEqual(end, true);
    stream.destroy();
    stream.write("Unexpected");
    assert.strictEqual(chunks.length, 4);
  });
  test("stream with non-reducible messages", () => {
    class TestMessage {
      constructor(value) {
        this.value = value;
      }
    }
    const stream = newWriteableStream(null);
    let error = false;
    stream.on("error", (e) => {
      error = true;
    });
    let end = false;
    stream.on("end", () => {
      end = true;
    });
    stream.write(new TestMessage("Hello"));
    const chunks = [];
    stream.on("data", (data) => {
      chunks.push(data);
    });
    assert(
      chunks[0] instanceof TestMessage,
      "Message `0` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[0].value, "Hello");
    stream.write(new TestMessage("World"));
    assert(
      chunks[1] instanceof TestMessage,
      "Message `1` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[1].value, "World");
    assert.strictEqual(error, false);
    assert.strictEqual(end, false);
    stream.pause();
    stream.write(new TestMessage("1"));
    stream.write(new TestMessage("2"));
    stream.write(new TestMessage("3"));
    assert.strictEqual(chunks.length, 2);
    stream.resume();
    assert.strictEqual(chunks.length, 5);
    assert(
      chunks[2] instanceof TestMessage,
      "Message `2` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[2].value, "1");
    assert(
      chunks[3] instanceof TestMessage,
      "Message `3` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[3].value, "2");
    assert(
      chunks[4] instanceof TestMessage,
      "Message `4` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[4].value, "3");
    stream.error(new Error());
    assert.strictEqual(error, true);
    error = false;
    stream.error(new Error());
    assert.strictEqual(error, true);
    stream.end(new TestMessage("Final Bit"));
    assert.strictEqual(chunks.length, 6);
    assert(
      chunks[5] instanceof TestMessage,
      "Message `5` must be an instance of `TestMessage`."
    );
    assert.strictEqual(chunks[5].value, "Final Bit");
    assert.strictEqual(end, true);
    stream.destroy();
    stream.write(new TestMessage("Unexpected"));
    assert.strictEqual(chunks.length, 6);
  });
  test("WriteableStream - end with empty string works", async () => {
    const reducer = (strings) => strings.length > 0 ? strings.join() : "error";
    const stream = newWriteableStream(reducer);
    stream.end("");
    const result = await consumeStream(stream, reducer);
    assert.strictEqual(result, "");
  });
  test("WriteableStream - end with error works", async () => {
    const reducer = (errors) => errors[0];
    const stream = newWriteableStream(reducer);
    stream.end(new Error("error"));
    const result = await consumeStream(stream, reducer);
    assert.ok(result instanceof Error);
  });
  test("WriteableStream - removeListener", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    const errorListener = (e) => {
      error = true;
    };
    stream.on("error", errorListener);
    let data = false;
    const dataListener = () => {
      data = true;
    };
    stream.on("data", dataListener);
    stream.write("Hello");
    assert.strictEqual(data, true);
    data = false;
    stream.removeListener("data", dataListener);
    stream.write("World");
    assert.strictEqual(data, false);
    stream.error(new Error());
    assert.strictEqual(error, true);
    error = false;
    stream.removeListener("error", errorListener);
    stream.on("error", () => {
    });
    stream.error(new Error());
    assert.strictEqual(error, false);
  });
  test("WriteableStream - highWaterMark", async () => {
    const stream = newWriteableStream((strings) => strings.join(), { highWaterMark: 3 });
    let res = stream.write("1");
    assert.ok(!res);
    res = stream.write("2");
    assert.ok(!res);
    res = stream.write("3");
    assert.ok(!res);
    const promise1 = stream.write("4");
    assert.ok(promise1 instanceof Promise);
    const promise2 = stream.write("5");
    assert.ok(promise2 instanceof Promise);
    let drained1 = false;
    (async () => {
      await promise1;
      drained1 = true;
    })();
    let drained2 = false;
    (async () => {
      await promise2;
      drained2 = true;
    })();
    let data = void 0;
    stream.on("data", (chunk) => {
      data = chunk;
    });
    assert.ok(data);
    await timeout(0);
    assert.strictEqual(drained1, true);
    assert.strictEqual(drained2, true);
  });
  test("consumeReadable", () => {
    const readable = arrayToReadable(["1", "2", "3", "4", "5"]);
    const consumed = consumeReadable(readable, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("peekReadable", () => {
    for (let i = 0; i < 5; i++) {
      const readable2 = arrayToReadable(["1", "2", "3", "4", "5"]);
      const consumedOrReadable2 = peekReadable(readable2, (strings) => strings.join(), i);
      if (typeof consumedOrReadable2 === "string") {
        assert.fail("Unexpected result");
      } else {
        const consumed = consumeReadable(consumedOrReadable2, (strings) => strings.join());
        assert.strictEqual(consumed, "1,2,3,4,5");
      }
    }
    let readable = arrayToReadable(["1", "2", "3", "4", "5"]);
    let consumedOrReadable = peekReadable(readable, (strings) => strings.join(), 5);
    assert.strictEqual(consumedOrReadable, "1,2,3,4,5");
    readable = arrayToReadable(["1", "2", "3", "4", "5"]);
    consumedOrReadable = peekReadable(readable, (strings) => strings.join(), 6);
    assert.strictEqual(consumedOrReadable, "1,2,3,4,5");
  });
  test("peekReadable - error handling", async () => {
    let stream = newWriteableStream((data) => data);
    let error = void 0;
    let promise = (async () => {
      try {
        await peekStream(stream, 1);
      } catch (err) {
        error = err;
      }
    })();
    stream.error(new Error());
    await promise;
    assert.ok(error);
    stream = newWriteableStream((data) => data);
    error = void 0;
    promise = (async () => {
      try {
        await peekStream(stream, 1);
      } catch (err) {
        error = err;
      }
    })();
    stream.write("foo");
    stream.error(new Error());
    await promise;
    assert.ok(error);
    stream = newWriteableStream((data) => data);
    error = void 0;
    promise = (async () => {
      try {
        await peekStream(stream, 1);
      } catch (err) {
        error = err;
      }
    })();
    stream.write("foo");
    stream.write("bar");
    stream.error(new Error());
    await promise;
    assert.ok(!error);
    stream.on("error", (err) => error = err);
    stream.on("data", (chunk) => {
    });
    assert.ok(error);
  });
  function arrayToReadable(array) {
    return {
      read: () => array.shift() || null
    };
  }
  function readableToStream(readable) {
    const stream = newWriteableStream((strings) => strings.join());
    setTimeout(() => {
      let chunk = null;
      while ((chunk = readable.read()) !== null) {
        stream.write(chunk);
      }
      stream.end();
    }, 0);
    return stream;
  }
  test("consumeStream", async () => {
    const stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    const consumed = await consumeStream(stream, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("consumeStream - without reducer", async () => {
    const stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    const consumed = await consumeStream(stream);
    assert.strictEqual(consumed, void 0);
  });
  test("consumeStream - without reducer and error", async () => {
    const stream = newWriteableStream((strings) => strings.join());
    stream.error(new Error());
    const consumed = await consumeStream(stream);
    assert.strictEqual(consumed, void 0);
  });
  test("listenStream", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    let end = false;
    let data = "";
    listenStream(stream, {
      onData: (d) => {
        data = d;
      },
      onError: (e) => {
        error = true;
      },
      onEnd: () => {
        end = true;
      }
    });
    stream.write("Hello");
    assert.strictEqual(data, "Hello");
    stream.write("World");
    assert.strictEqual(data, "World");
    assert.strictEqual(error, false);
    assert.strictEqual(end, false);
    stream.error(new Error());
    assert.strictEqual(error, true);
    stream.end("Final Bit");
    assert.strictEqual(end, true);
  });
  test("listenStream - cancellation", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let error = false;
    let end = false;
    let data = "";
    const cts = new CancellationTokenSource();
    listenStream(stream, {
      onData: (d) => {
        data = d;
      },
      onError: (e) => {
        error = true;
      },
      onEnd: () => {
        end = true;
      }
    }, cts.token);
    cts.cancel();
    stream.write("Hello");
    assert.strictEqual(data, "");
    stream.write("World");
    assert.strictEqual(data, "");
    stream.error(new Error());
    assert.strictEqual(error, false);
    stream.end("Final Bit");
    assert.strictEqual(end, false);
  });
  test("peekStream", async () => {
    for (let i = 0; i < 5; i++) {
      const stream2 = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
      const result2 = await peekStream(stream2, i);
      assert.strictEqual(stream2, result2.stream);
      if (result2.ended) {
        assert.fail("Unexpected result, stream should not have ended yet");
      } else {
        assert.strictEqual(result2.buffer.length, i + 1, `maxChunks: ${i}`);
        const additionalResult = [];
        await consumeStream(stream2, (strings) => {
          additionalResult.push(...strings);
          return strings.join();
        });
        assert.strictEqual([...result2.buffer, ...additionalResult].join(), "1,2,3,4,5");
      }
    }
    let stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    let result = await peekStream(stream, 5);
    assert.strictEqual(stream, result.stream);
    assert.strictEqual(result.buffer.join(), "1,2,3,4,5");
    assert.strictEqual(result.ended, true);
    stream = readableToStream(arrayToReadable(["1", "2", "3", "4", "5"]));
    result = await peekStream(stream, 6);
    assert.strictEqual(stream, result.stream);
    assert.strictEqual(result.buffer.join(), "1,2,3,4,5");
    assert.strictEqual(result.ended, true);
  });
  test("toStream", async () => {
    const stream = toStream("1,2,3,4,5", (strings) => strings.join());
    const consumed = await consumeStream(stream, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("toReadable", async () => {
    const readable = toReadable("1,2,3,4,5");
    const consumed = consumeReadable(readable, (strings) => strings.join());
    assert.strictEqual(consumed, "1,2,3,4,5");
  });
  test("transform", async () => {
    const source = newWriteableStream((strings) => strings.join());
    const result = transform(source, { data: (string) => string + string }, (strings) => strings.join());
    setTimeout(() => {
      source.write("1");
      source.write("2");
      source.write("3");
      source.write("4");
      source.end("5");
    }, 0);
    const consumed = await consumeStream(result, (strings) => strings.join());
    assert.strictEqual(consumed, "11,22,33,44,55");
  });
  test("events are delivered even if a listener is removed during delivery", () => {
    const stream = newWriteableStream((strings) => strings.join());
    let listener1Called = false;
    let listener2Called = false;
    const listener1 = () => {
      stream.removeListener("end", listener1);
      listener1Called = true;
    };
    const listener2 = () => {
      listener2Called = true;
    };
    stream.on("end", listener1);
    stream.on("end", listener2);
    stream.on("data", () => {
    });
    stream.end("");
    assert.strictEqual(listener1Called, true);
    assert.strictEqual(listener2Called, true);
  });
  test("prefixedReadable", () => {
    let readable = prefixedReadable("1,2", arrayToReadable(["3", "4", "5"]), (val) => val.join(","));
    assert.strictEqual(consumeReadable(readable, (val) => val.join(",")), "1,2,3,4,5");
    readable = prefixedReadable("empty", arrayToReadable([]), (val) => val.join(","));
    assert.strictEqual(consumeReadable(readable, (val) => val.join(",")), "empty");
  });
  test("prefixedStream", async () => {
    let stream = newWriteableStream((strings) => strings.join());
    stream.write("3");
    stream.write("4");
    stream.write("5");
    stream.end();
    let prefixStream = prefixedStream("1,2", stream, (val) => val.join(","));
    assert.strictEqual(await consumeStream(prefixStream, (val) => val.join(",")), "1,2,3,4,5");
    stream = newWriteableStream((strings) => strings.join());
    stream.end();
    prefixStream = prefixedStream("1,2", stream, (val) => val.join(","));
    assert.strictEqual(await consumeStream(prefixStream, (val) => val.join(",")), "1,2");
    stream = newWriteableStream((strings) => strings.join());
    stream.error(new Error("fail"));
    prefixStream = prefixedStream("error", stream, (val) => val.join(","));
    let error;
    try {
      await consumeStream(prefixStream, (val) => val.join(","));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vc3RyZWFtLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9SZWFkYWJsZSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjb25zdW1lUmVhZGFibGUsIGNvbnN1bWVTdHJlYW0sIGlzUmVhZGFibGUsIGlzUmVhZGFibGVCdWZmZXJlZFN0cmVhbSwgaXNSZWFkYWJsZVN0cmVhbSwgbGlzdGVuU3RyZWFtLCBuZXdXcml0ZWFibGVTdHJlYW0sIHBlZWtSZWFkYWJsZSwgcGVla1N0cmVhbSwgcHJlZml4ZWRSZWFkYWJsZSwgcHJlZml4ZWRTdHJlYW0sIFJlYWRhYmxlLCBSZWFkYWJsZVN0cmVhbSwgdG9SZWFkYWJsZSwgdG9TdHJlYW0sIHRyYW5zZm9ybSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdHJlYW0uanMnO1xuXG5zdWl0ZSgnU3RyZWFtJywgKCkgPT4ge1xuXG5cdHRlc3QoJ2lzUmVhZGFibGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKCFpc1JlYWRhYmxlKHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC5vayghaXNSZWFkYWJsZShPYmplY3QuY3JlYXRlKG51bGwpKSk7XG5cdFx0YXNzZXJ0Lm9rKGlzUmVhZGFibGUoYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSkpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNSZWFkYWJsZVN0cmVhbScsICgpID0+IHtcblx0XHRhc3NlcnQub2soIWlzUmVhZGFibGVTdHJlYW0odW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0Lm9rKCFpc1JlYWRhYmxlU3RyZWFtKE9iamVjdC5jcmVhdGUobnVsbCkpKTtcblx0XHRhc3NlcnQub2soaXNSZWFkYWJsZVN0cmVhbShuZXdXcml0ZWFibGVTdHJlYW0oZCA9PiBkKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKCFpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0oT2JqZWN0LmNyZWF0ZShudWxsKSkpO1xuXG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtKGQgPT4gZCk7XG5cdFx0c3RyZWFtLmVuZCgpO1xuXHRcdGNvbnN0IGJ1ZmZlcmVkU3RyZWFtID0gYXdhaXQgcGVla1N0cmVhbShzdHJlYW0sIDEpO1xuXHRcdGFzc2VydC5vayhpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0oYnVmZmVyZWRTdHJlYW0pKTtcblx0fSk7XG5cblx0dGVzdCgnV3JpdGVhYmxlU3RyZWFtIC0gYmFzaWNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0bGV0IGVycm9yID0gZmFsc2U7XG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsIGUgPT4ge1xuXHRcdFx0ZXJyb3IgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVuZCA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0ZW5kID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHN0cmVhbS53cml0ZSgnSGVsbG8nKTtcblxuXHRcdGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdGNodW5rcy5wdXNoKGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1swXSwgJ0hlbGxvJyk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rc1sxXSwgJ1dvcmxkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCBmYWxzZSk7XG5cblx0XHRzdHJlYW0ucGF1c2UoKTtcblx0XHRzdHJlYW0ud3JpdGUoJzEnKTtcblx0XHRzdHJlYW0ud3JpdGUoJzInKTtcblx0XHRzdHJlYW0ud3JpdGUoJzMnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAyKTtcblxuXHRcdHN0cmVhbS5yZXN1bWUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3MubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzJdLCAnMSwyLDMnKTtcblxuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCB0cnVlKTtcblxuXHRcdGVycm9yID0gZmFsc2U7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIHRydWUpO1xuXG5cdFx0c3RyZWFtLmVuZCgnRmluYWwgQml0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbM10sICdGaW5hbCBCaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCB0cnVlKTtcblxuXHRcdHN0cmVhbS5kZXN0cm95KCk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ1VuZXhwZWN0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbSB3aXRoIG5vbi1yZWR1Y2libGUgbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0LyoqXG5cdFx0ICogQSBjb21wbGV4IG9iamVjdCB0aGF0IGNhbm5vdCBiZSByZWR1Y2VkIHRvIGEgc2luZ2xlIG9iamVjdC5cblx0XHQgKi9cblx0XHRjbGFzcyBUZXN0TWVzc2FnZSB7XG5cdFx0XHRjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykgeyB9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPFRlc3RNZXNzYWdlPihudWxsKTtcblxuXHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlID0+IHtcblx0XHRcdGVycm9yID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGxldCBlbmQgPSBmYWxzZTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdGVuZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRzdHJlYW0ud3JpdGUobmV3IFRlc3RNZXNzYWdlKCdIZWxsbycpKTtcblxuXHRcdGNvbnN0IGNodW5rczogVGVzdE1lc3NhZ2VbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjaHVua3NbMF0gaW5zdGFuY2VvZiBUZXN0TWVzc2FnZSxcblx0XHRcdCdNZXNzYWdlIGAwYCBtdXN0IGJlIGFuIGluc3RhbmNlIG9mIGBUZXN0TWVzc2FnZWAuJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMF0udmFsdWUsICdIZWxsbycpO1xuXG5cdFx0c3RyZWFtLndyaXRlKG5ldyBUZXN0TWVzc2FnZSgnV29ybGQnKSk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjaHVua3NbMV0gaW5zdGFuY2VvZiBUZXN0TWVzc2FnZSxcblx0XHRcdCdNZXNzYWdlIGAxYCBtdXN0IGJlIGFuIGluc3RhbmNlIG9mIGBUZXN0TWVzc2FnZWAuJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMV0udmFsdWUsICdXb3JsZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuZCwgZmFsc2UpO1xuXG5cdFx0c3RyZWFtLnBhdXNlKCk7XG5cdFx0c3RyZWFtLndyaXRlKG5ldyBUZXN0TWVzc2FnZSgnMScpKTtcblx0XHRzdHJlYW0ud3JpdGUobmV3IFRlc3RNZXNzYWdlKCcyJykpO1xuXHRcdHN0cmVhbS53cml0ZShuZXcgVGVzdE1lc3NhZ2UoJzMnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgMik7XG5cblx0XHRzdHJlYW0ucmVzdW1lKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzLmxlbmd0aCwgNSk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjaHVua3NbMl0gaW5zdGFuY2VvZiBUZXN0TWVzc2FnZSxcblx0XHRcdCdNZXNzYWdlIGAyYCBtdXN0IGJlIGFuIGluc3RhbmNlIG9mIGBUZXN0TWVzc2FnZWAuJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbMl0udmFsdWUsICcxJyk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjaHVua3NbM10gaW5zdGFuY2VvZiBUZXN0TWVzc2FnZSxcblx0XHRcdCdNZXNzYWdlIGAzYCBtdXN0IGJlIGFuIGluc3RhbmNlIG9mIGBUZXN0TWVzc2FnZWAuJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbM10udmFsdWUsICcyJyk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjaHVua3NbNF0gaW5zdGFuY2VvZiBUZXN0TWVzc2FnZSxcblx0XHRcdCdNZXNzYWdlIGA0YCBtdXN0IGJlIGFuIGluc3RhbmNlIG9mIGBUZXN0TWVzc2FnZWAuJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaHVua3NbNF0udmFsdWUsICczJyk7XG5cblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgdHJ1ZSk7XG5cblx0XHRlcnJvciA9IGZhbHNlO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCB0cnVlKTtcblxuXHRcdHN0cmVhbS5lbmQobmV3IFRlc3RNZXNzYWdlKCdGaW5hbCBCaXQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDYpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2h1bmtzWzVdIGluc3RhbmNlb2YgVGVzdE1lc3NhZ2UsXG5cdFx0XHQnTWVzc2FnZSBgNWAgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdE1lc3NhZ2VgLicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2h1bmtzWzVdLnZhbHVlLCAnRmluYWwgQml0Jyk7XG5cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmQsIHRydWUpO1xuXG5cdFx0c3RyZWFtLmRlc3Ryb3koKTtcblxuXHRcdHN0cmVhbS53cml0ZShuZXcgVGVzdE1lc3NhZ2UoJ1VuZXhwZWN0ZWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNodW5rcy5sZW5ndGgsIDYpO1xuXHR9KTtcblxuXHR0ZXN0KCdXcml0ZWFibGVTdHJlYW0gLSBlbmQgd2l0aCBlbXB0eSBzdHJpbmcgd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVkdWNlciA9IChzdHJpbmdzOiBzdHJpbmdbXSkgPT4gc3RyaW5ncy5sZW5ndGggPiAwID8gc3RyaW5ncy5qb2luKCkgOiAnZXJyb3InO1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHJlZHVjZXIpO1xuXHRcdHN0cmVhbS5lbmQoJycpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29uc3VtZVN0cmVhbShzdHJlYW0sIHJlZHVjZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcnKTtcblx0fSk7XG5cblx0dGVzdCgnV3JpdGVhYmxlU3RyZWFtIC0gZW5kIHdpdGggZXJyb3Igd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVkdWNlciA9IChlcnJvcnM6IEVycm9yW10pID0+IGVycm9yc1swXTtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08RXJyb3I+KHJlZHVjZXIpO1xuXHRcdHN0cmVhbS5lbmQobmV3IEVycm9yKCdlcnJvcicpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnN1bWVTdHJlYW0oc3RyZWFtLCByZWR1Y2VyKTtcblx0XHRhc3NlcnQub2socmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdXcml0ZWFibGVTdHJlYW0gLSByZW1vdmVMaXN0ZW5lcicsICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblxuXHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXHRcdGNvbnN0IGVycm9yTGlzdGVuZXIgPSAoZTogRXJyb3IpID0+IHtcblx0XHRcdGVycm9yID0gdHJ1ZTtcblx0XHR9O1xuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnJvckxpc3RlbmVyKTtcblxuXHRcdGxldCBkYXRhID0gZmFsc2U7XG5cdFx0Y29uc3QgZGF0YUxpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0ZGF0YSA9IHRydWU7XG5cdFx0fTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBkYXRhTGlzdGVuZXIpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLCB0cnVlKTtcblxuXHRcdGRhdGEgPSBmYWxzZTtcblx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2RhdGEnLCBkYXRhTGlzdGVuZXIpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLCBmYWxzZSk7XG5cblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgdHJ1ZSk7XG5cblx0XHRlcnJvciA9IGZhbHNlO1xuXHRcdHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBlcnJvckxpc3RlbmVyKTtcblxuXHRcdC8vIGFsd2F5cyBsZWF2ZSBhdCBsZWFzdCBvbmUgZXJyb3IgbGlzdGVuZXIgdG8gc3RyZWFtcyB0byBhdm9pZCB1bmV4cGVjdGVkIGVycm9ycyBkdXJpbmcgdGVzdCBydW5uaW5nXG5cdFx0c3RyZWFtLm9uKCdlcnJvcicsICgpID0+IHsgfSk7XG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnV3JpdGVhYmxlU3RyZWFtIC0gaGlnaFdhdGVyTWFyaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpLCB7IGhpZ2hXYXRlck1hcms6IDMgfSk7XG5cblx0XHRsZXQgcmVzID0gc3RyZWFtLndyaXRlKCcxJyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMpO1xuXG5cdFx0cmVzID0gc3RyZWFtLndyaXRlKCcyJyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMpO1xuXG5cdFx0cmVzID0gc3RyZWFtLndyaXRlKCczJyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZTEgPSBzdHJlYW0ud3JpdGUoJzQnKTtcblx0XHRhc3NlcnQub2socHJvbWlzZTEgaW5zdGFuY2VvZiBQcm9taXNlKTtcblxuXHRcdGNvbnN0IHByb21pc2UyID0gc3RyZWFtLndyaXRlKCc1Jyk7XG5cdFx0YXNzZXJ0Lm9rKHByb21pc2UyIGluc3RhbmNlb2YgUHJvbWlzZSk7XG5cblx0XHRsZXQgZHJhaW5lZDEgPSBmYWxzZTtcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcHJvbWlzZTE7XG5cdFx0XHRkcmFpbmVkMSA9IHRydWU7XG5cdFx0fSkoKTtcblxuXHRcdGxldCBkcmFpbmVkMiA9IGZhbHNlO1xuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBwcm9taXNlMjtcblx0XHRcdGRyYWluZWQyID0gdHJ1ZTtcblx0XHR9KSgpO1xuXG5cdFx0bGV0IGRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCBjaHVuayA9PiB7XG5cdFx0XHRkYXRhID0gY2h1bms7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKGRhdGEpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhaW5lZDEsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkcmFpbmVkMiwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN1bWVSZWFkYWJsZScsICgpID0+IHtcblx0XHRjb25zdCByZWFkYWJsZSA9IGFycmF5VG9SZWFkYWJsZShbJzEnLCAnMicsICczJywgJzQnLCAnNSddKTtcblx0XHRjb25zdCBjb25zdW1lZCA9IGNvbnN1bWVSZWFkYWJsZShyZWFkYWJsZSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCAnMSwyLDMsNCw1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlZWtSZWFkYWJsZScsICgpID0+IHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVhZGFibGUgPSBhcnJheVRvUmVhZGFibGUoWycxJywgJzInLCAnMycsICc0JywgJzUnXSk7XG5cblx0XHRcdGNvbnN0IGNvbnN1bWVkT3JSZWFkYWJsZSA9IHBlZWtSZWFkYWJsZShyZWFkYWJsZSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSwgaSk7XG5cdFx0XHRpZiAodHlwZW9mIGNvbnN1bWVkT3JSZWFkYWJsZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgcmVzdWx0Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb25zdW1lZCA9IGNvbnN1bWVSZWFkYWJsZShjb25zdW1lZE9yUmVhZGFibGUsIHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZWQsICcxLDIsMyw0LDUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcmVhZGFibGUgPSBhcnJheVRvUmVhZGFibGUoWycxJywgJzInLCAnMycsICc0JywgJzUnXSk7XG5cdFx0bGV0IGNvbnN1bWVkT3JSZWFkYWJsZSA9IHBlZWtSZWFkYWJsZShyZWFkYWJsZSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkT3JSZWFkYWJsZSwgJzEsMiwzLDQsNScpO1xuXG5cdFx0cmVhZGFibGUgPSBhcnJheVRvUmVhZGFibGUoWycxJywgJzInLCAnMycsICc0JywgJzUnXSk7XG5cdFx0Y29uc3VtZWRPclJlYWRhYmxlID0gcGVla1JlYWRhYmxlKHJlYWRhYmxlLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpLCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZWRPclJlYWRhYmxlLCAnMSwyLDMsNCw1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlZWtSZWFkYWJsZSAtIGVycm9yIGhhbmRsaW5nJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Ly8gMCBDaHVua3Ncblx0XHRsZXQgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtKGRhdGEgPT4gZGF0YSk7XG5cblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHBlZWtTdHJlYW0oc3RyZWFtLCAxKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRlcnJvciA9IGVycjtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0c3RyZWFtLmVycm9yKG5ldyBFcnJvcigpKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblxuXHRcdC8vIDEgQ2h1bmtcblx0XHRzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW0oZGF0YSA9PiBkYXRhKTtcblxuXHRcdGVycm9yID0gdW5kZWZpbmVkO1xuXHRcdHByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcGVla1N0cmVhbShzdHJlYW0sIDEpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGVycm9yID0gZXJyO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ2ZvbycpO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cblx0XHQvLyAyIENodW5rc1xuXHRcdHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbShkYXRhID0+IGRhdGEpO1xuXG5cdFx0ZXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0cHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwZWVrU3RyZWFtKHN0cmVhbSwgMSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHN0cmVhbS53cml0ZSgnZm9vJyk7XG5cdFx0c3RyZWFtLndyaXRlKCdiYXInKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRhc3NlcnQub2soIWVycm9yKTtcblxuXHRcdHN0cmVhbS5vbignZXJyb3InLCBlcnIgPT4gZXJyb3IgPSBlcnIpO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGNodW5rID0+IHsgfSk7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXJyYXlUb1JlYWRhYmxlPFQ+KGFycmF5OiBUW10pOiBSZWFkYWJsZTxUPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlYWQ6ICgpID0+IGFycmF5LnNoaWZ0KCkgfHwgbnVsbFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkYWJsZVRvU3RyZWFtKHJlYWRhYmxlOiBSZWFkYWJsZTxzdHJpbmc+KTogUmVhZGFibGVTdHJlYW08c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cblx0XHQvLyBTaW11bGF0ZSBhc3luYyBiZWhhdmlvclxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0bGV0IGNodW5rOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdHdoaWxlICgoY2h1bmsgPSByZWFkYWJsZS5yZWFkKCkpICE9PSBudWxsKSB7XG5cdFx0XHRcdHN0cmVhbS53cml0ZShjaHVuayk7XG5cdFx0XHR9XG5cblx0XHRcdHN0cmVhbS5lbmQoKTtcblx0XHR9LCAwKTtcblxuXHRcdHJldHVybiBzdHJlYW07XG5cdH1cblxuXHR0ZXN0KCdjb25zdW1lU3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IHJlYWRhYmxlVG9TdHJlYW0oYXJyYXlUb1JlYWRhYmxlKFsnMScsICcyJywgJzMnLCAnNCcsICc1J10pKTtcblx0XHRjb25zdCBjb25zdW1lZCA9IGF3YWl0IGNvbnN1bWVTdHJlYW0oc3RyZWFtLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZWQsICcxLDIsMyw0LDUnKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3VtZVN0cmVhbSAtIHdpdGhvdXQgcmVkdWNlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSByZWFkYWJsZVRvU3RyZWFtKGFycmF5VG9SZWFkYWJsZShbJzEnLCAnMicsICczJywgJzQnLCAnNSddKSk7XG5cdFx0Y29uc3QgY29uc3VtZWQgPSBhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdW1lU3RyZWFtIC0gd2l0aG91dCByZWR1Y2VyIGFuZCBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08c3RyaW5nPihzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXG5cdFx0Y29uc3QgY29uc3VtZWQgPSBhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0ZW5TdHJlYW0nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cblx0XHRsZXQgZXJyb3IgPSBmYWxzZTtcblx0XHRsZXQgZW5kID0gZmFsc2U7XG5cdFx0bGV0IGRhdGEgPSAnJztcblxuXHRcdGxpc3RlblN0cmVhbShzdHJlYW0sIHtcblx0XHRcdG9uRGF0YTogZCA9PiB7XG5cdFx0XHRcdGRhdGEgPSBkO1xuXHRcdFx0fSxcblx0XHRcdG9uRXJyb3I6IGUgPT4ge1xuXHRcdFx0XHRlcnJvciA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0b25FbmQ6ICgpID0+IHtcblx0XHRcdFx0ZW5kID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHN0cmVhbS53cml0ZSgnSGVsbG8nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLCAnSGVsbG8nKTtcblxuXHRcdHN0cmVhbS53cml0ZSgnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgJ1dvcmxkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCBmYWxzZSk7XG5cblx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgdHJ1ZSk7XG5cblx0XHRzdHJlYW0uZW5kKCdGaW5hbCBCaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdGVuU3RyZWFtIC0gY2FuY2VsbGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0bGV0IGVycm9yID0gZmFsc2U7XG5cdFx0bGV0IGVuZCA9IGZhbHNlO1xuXHRcdGxldCBkYXRhID0gJyc7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGxpc3RlblN0cmVhbShzdHJlYW0sIHtcblx0XHRcdG9uRGF0YTogZCA9PiB7XG5cdFx0XHRcdGRhdGEgPSBkO1xuXHRcdFx0fSxcblx0XHRcdG9uRXJyb3I6IGUgPT4ge1xuXHRcdFx0XHRlcnJvciA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0b25FbmQ6ICgpID0+IHtcblx0XHRcdFx0ZW5kID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9LCBjdHMudG9rZW4pO1xuXG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0c3RyZWFtLndyaXRlKCdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLCAnJyk7XG5cblx0XHRzdHJlYW0ud3JpdGUoJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEsICcnKTtcblxuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCBmYWxzZSk7XG5cblx0XHRzdHJlYW0uZW5kKCdGaW5hbCBCaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlZWtTdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdGNvbnN0IHN0cmVhbSA9IHJlYWRhYmxlVG9TdHJlYW0oYXJyYXlUb1JlYWRhYmxlKFsnMScsICcyJywgJzMnLCAnNCcsICc1J10pKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVla1N0cmVhbShzdHJlYW0sIGkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbSwgcmVzdWx0LnN0cmVhbSk7XG5cdFx0XHRpZiAocmVzdWx0LmVuZGVkKSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIHJlc3VsdCwgc3RyZWFtIHNob3VsZCBub3QgaGF2ZSBlbmRlZCB5ZXQnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYnVmZmVyLmxlbmd0aCwgaSArIDEsIGBtYXhDaHVua3M6ICR7aX1gKTtcblxuXHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsUmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbSwgc3RyaW5ncyA9PiB7XG5cdFx0XHRcdFx0YWRkaXRpb25hbFJlc3VsdC5wdXNoKC4uLnN0cmluZ3MpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHN0cmluZ3Muam9pbigpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoWy4uLnJlc3VsdC5idWZmZXIsIC4uLmFkZGl0aW9uYWxSZXN1bHRdLmpvaW4oKSwgJzEsMiwzLDQsNScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBzdHJlYW0gPSByZWFkYWJsZVRvU3RyZWFtKGFycmF5VG9SZWFkYWJsZShbJzEnLCAnMicsICczJywgJzQnLCAnNSddKSk7XG5cdFx0bGV0IHJlc3VsdCA9IGF3YWl0IHBlZWtTdHJlYW0oc3RyZWFtLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyZWFtLCByZXN1bHQuc3RyZWFtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJ1ZmZlci5qb2luKCksICcxLDIsMyw0LDUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVuZGVkLCB0cnVlKTtcblxuXHRcdHN0cmVhbSA9IHJlYWRhYmxlVG9TdHJlYW0oYXJyYXlUb1JlYWRhYmxlKFsnMScsICcyJywgJzMnLCAnNCcsICc1J10pKTtcblx0XHRyZXN1bHQgPSBhd2FpdCBwZWVrU3RyZWFtKHN0cmVhbSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbSwgcmVzdWx0LnN0cmVhbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5idWZmZXIuam9pbigpLCAnMSwyLDMsNCw1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmRlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvU3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IHRvU3RyZWFtKCcxLDIsMyw0LDUnLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRjb25zdCBjb25zdW1lZCA9IGF3YWl0IGNvbnN1bWVTdHJlYW0oc3RyZWFtLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZWQsICcxLDIsMyw0LDUnKTtcblx0fSk7XG5cblx0dGVzdCgndG9SZWFkYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWFkYWJsZSA9IHRvUmVhZGFibGUoJzEsMiwzLDQsNScpO1xuXHRcdGNvbnN0IGNvbnN1bWVkID0gY29uc3VtZVJlYWRhYmxlKHJlYWRhYmxlLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZWQsICcxLDIsMyw0LDUnKTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNmb3JtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJhbnNmb3JtKHNvdXJjZSwgeyBkYXRhOiBzdHJpbmcgPT4gc3RyaW5nICsgc3RyaW5nIH0sIHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYXN5bmMgYmVoYXZpb3Jcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHNvdXJjZS53cml0ZSgnMScpO1xuXHRcdFx0c291cmNlLndyaXRlKCcyJyk7XG5cdFx0XHRzb3VyY2Uud3JpdGUoJzMnKTtcblx0XHRcdHNvdXJjZS53cml0ZSgnNCcpO1xuXHRcdFx0c291cmNlLmVuZCgnNScpO1xuXHRcdH0sIDApO1xuXG5cdFx0Y29uc3QgY29uc3VtZWQgPSBhd2FpdCBjb25zdW1lU3RyZWFtKHJlc3VsdCwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnN1bWVkLCAnMTEsMjIsMzMsNDQsNTUnKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnRzIGFyZSBkZWxpdmVyZWQgZXZlbiBpZiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQgZHVyaW5nIGRlbGl2ZXJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXG5cdFx0bGV0IGxpc3RlbmVyMUNhbGxlZCA9IGZhbHNlO1xuXHRcdGxldCBsaXN0ZW5lcjJDYWxsZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyMSA9ICgpID0+IHsgc3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBsaXN0ZW5lcjEpOyBsaXN0ZW5lcjFDYWxsZWQgPSB0cnVlOyB9O1xuXHRcdGNvbnN0IGxpc3RlbmVyMiA9ICgpID0+IHsgbGlzdGVuZXIyQ2FsbGVkID0gdHJ1ZTsgfTtcblx0XHRzdHJlYW0ub24oJ2VuZCcsIGxpc3RlbmVyMSk7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCBsaXN0ZW5lcjIpO1xuXHRcdHN0cmVhbS5vbignZGF0YScsICgpID0+IHsgfSk7XG5cdFx0c3RyZWFtLmVuZCgnJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXIxQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXIyQ2FsbGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZml4ZWRSZWFkYWJsZScsICgpID0+IHtcblxuXHRcdC8vIEJhc2ljXG5cdFx0bGV0IHJlYWRhYmxlID0gcHJlZml4ZWRSZWFkYWJsZSgnMSwyJywgYXJyYXlUb1JlYWRhYmxlKFsnMycsICc0JywgJzUnXSksIHZhbCA9PiB2YWwuam9pbignLCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uc3VtZVJlYWRhYmxlKHJlYWRhYmxlLCB2YWwgPT4gdmFsLmpvaW4oJywnKSksICcxLDIsMyw0LDUnKTtcblxuXHRcdC8vIEVtcHR5XG5cdFx0cmVhZGFibGUgPSBwcmVmaXhlZFJlYWRhYmxlKCdlbXB0eScsIGFycmF5VG9SZWFkYWJsZTxzdHJpbmc+KFtdKSwgdmFsID0+IHZhbC5qb2luKCcsJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25zdW1lUmVhZGFibGUocmVhZGFibGUsIHZhbCA9PiB2YWwuam9pbignLCcpKSwgJ2VtcHR5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZpeGVkU3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Ly8gQmFzaWNcblx0XHRsZXQgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oKSk7XG5cdFx0c3RyZWFtLndyaXRlKCczJyk7XG5cdFx0c3RyZWFtLndyaXRlKCc0Jyk7XG5cdFx0c3RyZWFtLndyaXRlKCc1Jyk7XG5cdFx0c3RyZWFtLmVuZCgpO1xuXG5cdFx0bGV0IHByZWZpeFN0cmVhbSA9IHByZWZpeGVkU3RyZWFtPHN0cmluZz4oJzEsMicsIHN0cmVhbSwgdmFsID0+IHZhbC5qb2luKCcsJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25zdW1lU3RyZWFtKHByZWZpeFN0cmVhbSwgdmFsID0+IHZhbC5qb2luKCcsJykpLCAnMSwyLDMsNCw1Jyk7XG5cblx0XHQvLyBFbXB0eVxuXHRcdHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXHRcdHN0cmVhbS5lbmQoKTtcblxuXHRcdHByZWZpeFN0cmVhbSA9IHByZWZpeGVkU3RyZWFtPHN0cmluZz4oJzEsMicsIHN0cmVhbSwgdmFsID0+IHZhbC5qb2luKCcsJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25zdW1lU3RyZWFtKHByZWZpeFN0cmVhbSwgdmFsID0+IHZhbC5qb2luKCcsJykpLCAnMSwyJyk7XG5cblx0XHQvLyBFcnJvclxuXHRcdHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxzdHJpbmc+KHN0cmluZ3MgPT4gc3RyaW5ncy5qb2luKCkpO1xuXHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoJ2ZhaWwnKSk7XG5cblx0XHRwcmVmaXhTdHJlYW0gPSBwcmVmaXhlZFN0cmVhbTxzdHJpbmc+KCdlcnJvcicsIHN0cmVhbSwgdmFsID0+IHZhbC5qb2luKCcsJykpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjb25zdW1lU3RyZWFtKHByZWZpeFN0cmVhbSwgdmFsID0+IHZhbC5qb2luKCcsJykpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxr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Q2hCLFdBQU8sTUFBTSxHQUFHO0FBQ2hCLFdBQU8sTUFBTSxHQUFHO0FBQ2hCLFdBQU8sSUFBSTtBQUVYLFFBQUksZUFBZSxlQUF1QixPQUFPLFFBQVEsU0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO0FBQzdFLFdBQU8sWUFBWSxNQUFNLGNBQWMsY0FBYyxTQUFPLElBQUksS0FBSyxHQUFHLENBQUMsR0FBRyxXQUFXO0FBR3ZGLGFBQVMsbUJBQTJCLGFBQVcsUUFBUSxLQUFLLENBQUM7QUFDN0QsV0FBTyxJQUFJO0FBRVgsbUJBQWUsZUFBdUIsT0FBTyxRQUFRLFNBQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQztBQUN6RSxXQUFPLFlBQVksTUFBTSxjQUFjLGNBQWMsU0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDLEdBQUcsS0FBSztBQUdqRixhQUFTLG1CQUEyQixhQUFXLFFBQVEsS0FBSyxDQUFDO0FBQzdELFdBQU8sTUFBTSxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBRTlCLG1CQUFlLGVBQXVCLFNBQVMsUUFBUSxTQUFPLElBQUksS0FBSyxHQUFHLENBQUM7QUFFM0UsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLGNBQWMsY0FBYyxTQUFPLElBQUksS0FBSyxHQUFHLENBQUM7QUFBQSxJQUN2RCxTQUFTLEdBQUc7QUFDWCxjQUFRO0FBQUEsSUFDVDtBQUNBLFdBQU8sR0FBRyxLQUFLO0FBQUEsRUFDaEIsQ0FBQztBQUVELDBDQUF3QztBQUN6QyxDQUFDOyIsCiAgIm5hbWVzIjogWyJyZWFkYWJsZSIsICJjb25zdW1lZE9yUmVhZGFibGUiLCAic3RyZWFtIiwgInJlc3VsdCJdCn0K
