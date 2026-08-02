import { Writable } from "stream";
import assert from "assert";
import { StreamSplitter } from "../../node/nodeStreams.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("StreamSplitter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should split a stream on a single character splitter", (done) => {
    const chunks = [];
    const splitter = new StreamSplitter("\n");
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });
    splitter.pipe(writable);
    splitter.write("hello\nwor");
    splitter.write("ld\n");
    splitter.write("foo\nbar\nz");
    splitter.end(() => {
      assert.deepStrictEqual(chunks, ["hello\n", "world\n", "foo\n", "bar\n", "z"]);
      done();
    });
  });
  test("should split a stream on a multi-character splitter", (done) => {
    const chunks = [];
    const splitter = new StreamSplitter("---");
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });
    splitter.pipe(writable);
    splitter.write("hello---wor");
    splitter.write("ld---");
    splitter.write("foo---bar---z");
    splitter.end(() => {
      assert.deepStrictEqual(chunks, ["hello---", "world---", "foo---", "bar---", "z"]);
      done();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9ub2RlL25vZGVTdHJlYW1zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IFdyaXRhYmxlIH0gZnJvbSAnc3RyZWFtJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFN0cmVhbVNwbGl0dGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9ub2RlU3RyZWFtcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnU3RyZWFtU3BsaXR0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3VsZCBzcGxpdCBhIHN0cmVhbSBvbiBhIHNpbmdsZSBjaGFyYWN0ZXIgc3BsaXR0ZXInLCAoZG9uZSkgPT4ge1xuXHRcdGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzcGxpdHRlciA9IG5ldyBTdHJlYW1TcGxpdHRlcignXFxuJyk7XG5cdFx0Y29uc3Qgd3JpdGFibGUgPSBuZXcgV3JpdGFibGUoe1xuXHRcdFx0d3JpdGUoY2h1bmssIF9lbmNvZGluZywgY2FsbGJhY2spIHtcblx0XHRcdFx0Y2h1bmtzLnB1c2goY2h1bmsudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3BsaXR0ZXIucGlwZSh3cml0YWJsZSk7XG5cdFx0c3BsaXR0ZXIud3JpdGUoJ2hlbGxvXFxud29yJyk7XG5cdFx0c3BsaXR0ZXIud3JpdGUoJ2xkXFxuJyk7XG5cdFx0c3BsaXR0ZXIud3JpdGUoJ2Zvb1xcbmJhclxcbnonKTtcblx0XHRzcGxpdHRlci5lbmQoKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaHVua3MsIFsnaGVsbG9cXG4nLCAnd29ybGRcXG4nLCAnZm9vXFxuJywgJ2JhclxcbicsICd6J10pO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3BsaXQgYSBzdHJlYW0gb24gYSBtdWx0aS1jaGFyYWN0ZXIgc3BsaXR0ZXInLCAoZG9uZSkgPT4ge1xuXHRcdGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzcGxpdHRlciA9IG5ldyBTdHJlYW1TcGxpdHRlcignLS0tJyk7XG5cdFx0Y29uc3Qgd3JpdGFibGUgPSBuZXcgV3JpdGFibGUoe1xuXHRcdFx0d3JpdGUoY2h1bmssIF9lbmNvZGluZywgY2FsbGJhY2spIHtcblx0XHRcdFx0Y2h1bmtzLnB1c2goY2h1bmsudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3BsaXR0ZXIucGlwZSh3cml0YWJsZSk7XG5cdFx0c3BsaXR0ZXIud3JpdGUoJ2hlbGxvLS0td29yJyk7XG5cdFx0c3BsaXR0ZXIud3JpdGUoJ2xkLS0tJyk7XG5cdFx0c3BsaXR0ZXIud3JpdGUoJ2Zvby0tLWJhci0tLXonKTtcblx0XHRzcGxpdHRlci5lbmQoKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaHVua3MsIFsnaGVsbG8tLS0nLCAnd29ybGQtLS0nLCAnZm9vLS0tJywgJ2Jhci0tLScsICd6J10pO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxnQkFBZ0I7QUFDekIsT0FBTyxZQUFZO0FBQ25CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sa0JBQWtCLE1BQU07QUFDN0IsMENBQXdDO0FBRXhDLE9BQUssd0RBQXdELENBQUMsU0FBUztBQUN0RSxVQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBTSxXQUFXLElBQUksZUFBZSxJQUFJO0FBQ3hDLFVBQU0sV0FBVyxJQUFJLFNBQVM7QUFBQSxNQUM3QixNQUFNLE9BQU8sV0FBVyxVQUFVO0FBQ2pDLGVBQU8sS0FBSyxNQUFNLFNBQVMsQ0FBQztBQUM1QixpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUM7QUFFRCxhQUFTLEtBQUssUUFBUTtBQUN0QixhQUFTLE1BQU0sWUFBWTtBQUMzQixhQUFTLE1BQU0sTUFBTTtBQUNyQixhQUFTLE1BQU0sYUFBYTtBQUM1QixhQUFTLElBQUksTUFBTTtBQUNsQixhQUFPLGdCQUFnQixRQUFRLENBQUMsV0FBVyxXQUFXLFNBQVMsU0FBUyxHQUFHLENBQUM7QUFDNUUsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdURBQXVELENBQUMsU0FBUztBQUNyRSxVQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBTSxXQUFXLElBQUksZUFBZSxLQUFLO0FBQ3pDLFVBQU0sV0FBVyxJQUFJLFNBQVM7QUFBQSxNQUM3QixNQUFNLE9BQU8sV0FBVyxVQUFVO0FBQ2pDLGVBQU8sS0FBSyxNQUFNLFNBQVMsQ0FBQztBQUM1QixpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUM7QUFFRCxhQUFTLEtBQUssUUFBUTtBQUN0QixhQUFTLE1BQU0sYUFBYTtBQUM1QixhQUFTLE1BQU0sT0FBTztBQUN0QixhQUFTLE1BQU0sZUFBZTtBQUM5QixhQUFTLElBQUksTUFBTTtBQUNsQixhQUFPLGdCQUFnQixRQUFRLENBQUMsWUFBWSxZQUFZLFVBQVUsVUFBVSxHQUFHLENBQUM7QUFDaEYsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
