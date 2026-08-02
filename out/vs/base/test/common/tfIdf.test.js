import assert from "assert";
import { CancellationToken } from "../../common/cancellation.js";
import { TfIdfCalculator } from "../../common/tfIdf.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function permutate(arr) {
  if (arr.length === 0) {
    return [[]];
  }
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const permutationsRest = permutate(rest);
    for (let j = 0; j < permutationsRest.length; j++) {
      result.push([arr[i], ...permutationsRest[j]]);
    }
  }
  return result;
}
function assertScoreOrdersEqual(actualScores, expectedScoreKeys) {
  actualScores.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  assert.strictEqual(actualScores.length, expectedScoreKeys.length);
  for (let i = 0; i < expectedScoreKeys.length; i++) {
    assert.strictEqual(actualScores[i].key, expectedScoreKeys[i]);
  }
}
suite("TF-IDF Calculator", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Should return no scores when no documents are given", () => {
    const tfidf = new TfIdfCalculator();
    const scores = tfidf.calculateScores("something", CancellationToken.None);
    assertScoreOrdersEqual(scores, []);
  });
  test("Should return no scores for term not in document", () => {
    const tfidf = new TfIdfCalculator().updateDocuments([
      makeDocument("A", "cat dog fish")
    ]);
    const scores = tfidf.calculateScores("elepant", CancellationToken.None);
    assertScoreOrdersEqual(scores, []);
  });
  test("Should return scores for document with exact match", () => {
    for (const docs of permutate([
      makeDocument("A", "cat dog cat"),
      makeDocument("B", "cat fish")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["A"]);
    }
  });
  test("Should return document with more matches first", () => {
    for (const docs of permutate([
      makeDocument("/A", "cat dog cat"),
      makeDocument("/B", "cat fish"),
      makeDocument("/C", "frog")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B"]);
    }
  });
  test("Should return document with more matches first when term appears in all documents", () => {
    for (const docs of permutate([
      makeDocument("/A", "cat dog cat cat"),
      makeDocument("/B", "cat fish"),
      makeDocument("/C", "frog cat cat")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/C", "/B"]);
    }
  });
  test("Should weigh less common term higher", () => {
    for (const docs of permutate([
      makeDocument("/A", "cat dog cat"),
      makeDocument("/B", "fish"),
      makeDocument("/C", "cat cat cat cat"),
      makeDocument("/D", "cat fish")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat the dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/C", "/D"]);
    }
  });
  test("Should weigh chunks with less common terms higher", () => {
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/B", "/A"]);
    }
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B", "/B"]);
    }
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat the dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/B", "/A", "/B"]);
    }
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("lake fish", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A"]);
    }
  });
  test("Should ignore case and punctuation", () => {
    for (const docs of permutate([
      makeDocument("/A", "Cat doG.cat"),
      makeDocument("/B", "cAt fiSH"),
      makeDocument("/C", "frOg")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores(". ,CaT!  ", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B"]);
    }
  });
  test("Should match on camelCase words", () => {
    for (const docs of permutate([
      makeDocument("/A", "catDog cat"),
      makeDocument("/B", "fishCatFish"),
      makeDocument("/C", "frogcat")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("catDOG", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B"]);
    }
  });
  test("Should not match document after delete", () => {
    const docA = makeDocument("/A", "cat dog cat");
    const docB = makeDocument("/B", "cat fish");
    const docC = makeDocument("/C", "frog");
    const tfidf = new TfIdfCalculator().updateDocuments([docA, docB, docC]);
    let scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, ["/A", "/B"]);
    tfidf.deleteDocument(docA.key);
    scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, ["/B"]);
    tfidf.deleteDocument(docC.key);
    scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, ["/B"]);
    tfidf.deleteDocument(docB.key);
    scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, []);
  });
});
function makeDocument(key, content) {
  return {
    key,
    textChunks: Array.isArray(content) ? content : [content]
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vdGZJZGYudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZklkZkNhbGN1bGF0b3IsIFRmSWRmRG9jdW1lbnQsIFRmSWRmU2NvcmUgfSBmcm9tICcuLi8uLi9jb21tb24vdGZJZGYuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbi8qKlxuICogR2VuZXJhdGVzIGFsbCBwZXJtdXRhdGlvbnMgb2YgYW4gYXJyYXkuXG4gKlxuICogVGhpcyBpcyB1c2VmdWwgZm9yIHRlc3RpbmcgdG8gbWFrZSBzdXJlIG9yZGVyIGRvZXMgbm90IGVmZmVjdCB0aGUgcmVzdWx0LlxuICovXG5mdW5jdGlvbiBwZXJtdXRhdGU8VD4oYXJyOiBUW10pOiBUW11bXSB7XG5cdGlmIChhcnIubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtbXV07XG5cdH1cblxuXHRjb25zdCByZXN1bHQ6IFRbXVtdID0gW107XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCByZXN0ID0gWy4uLmFyci5zbGljZSgwLCBpKSwgLi4uYXJyLnNsaWNlKGkgKyAxKV07XG5cdFx0Y29uc3QgcGVybXV0YXRpb25zUmVzdCA9IHBlcm11dGF0ZShyZXN0KTtcblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHBlcm11dGF0aW9uc1Jlc3QubGVuZ3RoOyBqKyspIHtcblx0XHRcdHJlc3VsdC5wdXNoKFthcnJbaV0sIC4uLnBlcm11dGF0aW9uc1Jlc3Rbal1dKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBhc3NlcnRTY29yZU9yZGVyc0VxdWFsKGFjdHVhbFNjb3JlczogVGZJZGZTY29yZVtdLCBleHBlY3RlZFNjb3JlS2V5czogc3RyaW5nW10pOiB2b2lkIHtcblx0YWN0dWFsU2NvcmVzLnNvcnQoKGEsIGIpID0+IChiLnNjb3JlIC0gYS5zY29yZSkgfHwgYS5rZXkubG9jYWxlQ29tcGFyZShiLmtleSkpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsU2NvcmVzLmxlbmd0aCwgZXhwZWN0ZWRTY29yZUtleXMubGVuZ3RoKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHBlY3RlZFNjb3JlS2V5cy5sZW5ndGg7IGkrKykge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxTY29yZXNbaV0ua2V5LCBleHBlY3RlZFNjb3JlS2V5c1tpXSk7XG5cdH1cbn1cblxuc3VpdGUoJ1RGLUlERiBDYWxjdWxhdG9yJywgZnVuY3Rpb24gKCkge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVzdCgnU2hvdWxkIHJldHVybiBubyBzY29yZXMgd2hlbiBubyBkb2N1bWVudHMgYXJlIGdpdmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpO1xuXHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3Jlcygnc29tZXRoaW5nJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIHJldHVybiBubyBzY29yZXMgZm9yIHRlcm0gbm90IGluIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJ0EnLCAnY2F0IGRvZyBmaXNoJyksXG5cdFx0XSk7XG5cdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdlbGVwYW50JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIHJldHVybiBzY29yZXMgZm9yIGRvY3VtZW50IHdpdGggZXhhY3QgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJ0EnLCAnY2F0IGRvZyBjYXQnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnQicsICdjYXQgZmlzaCcpLFxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2RvZycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnQSddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZXR1cm4gZG9jdW1lbnQgd2l0aCBtb3JlIG1hdGNoZXMgZmlyc3QnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9BJywgJ2NhdCBkb2cgY2F0JyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgJ2NhdCBmaXNoJyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9DJywgJ2Zyb2cnKSxcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXQnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJy9BJywgJy9CJ10pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIHJldHVybiBkb2N1bWVudCB3aXRoIG1vcmUgbWF0Y2hlcyBmaXJzdCB3aGVuIHRlcm0gYXBwZWFycyBpbiBhbGwgZG9jdW1lbnRzJywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCcvQScsICdjYXQgZG9nIGNhdCBjYXQnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0InLCAnY2F0IGZpc2gnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0MnLCAnZnJvZyBjYXQgY2F0JyksXG5cdFx0XSkpIHtcblx0XHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhkb2NzKTtcblx0XHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnY2F0JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQScsICcvQycsICcvQiddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCB3ZWlnaCBsZXNzIGNvbW1vbiB0ZXJtIGhpZ2hlcicsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGRvY3Mgb2YgcGVybXV0YXRlKFtcblx0XHRcdG1ha2VEb2N1bWVudCgnL0EnLCAnY2F0IGRvZyBjYXQnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0InLCAnZmlzaCcpLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQycsICdjYXQgY2F0IGNhdCBjYXQnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0QnLCAnY2F0IGZpc2gnKVxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdCB0aGUgZG9nJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQScsICcvQycsICcvRCddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCB3ZWlnaCBjaHVua3Mgd2l0aCBsZXNzIGNvbW1vbiB0ZXJtcyBoaWdoZXInLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9BJywgWydjYXQgZG9nIGNhdCcsICdmaXNoJ10pLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQicsIFsnY2F0IGNhdCBjYXQgY2F0IGRvZycsICdkb2cnXSlcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXQnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJy9CJywgJy9BJ10pO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCcvQScsIFsnY2F0IGRvZyBjYXQnLCAnZmlzaCddKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0InLCBbJ2NhdCBjYXQgY2F0IGNhdCBkb2cnLCAnZG9nJ10pXG5cdFx0XSkpIHtcblx0XHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhkb2NzKTtcblx0XHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnZG9nJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQScsICcvQicsICcvQiddKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRvY3Mgb2YgcGVybXV0YXRlKFtcblx0XHRcdG1ha2VEb2N1bWVudCgnL0EnLCBbJ2NhdCBkb2cgY2F0JywgJ2Zpc2gnXSksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgWydjYXQgY2F0IGNhdCBjYXQgZG9nJywgJ2RvZyddKVxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdCB0aGUgZG9nJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQicsICcvQScsICcvQiddKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRvY3Mgb2YgcGVybXV0YXRlKFtcblx0XHRcdG1ha2VEb2N1bWVudCgnL0EnLCBbJ2NhdCBkb2cgY2F0JywgJ2Zpc2gnXSksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgWydjYXQgY2F0IGNhdCBjYXQgZG9nJywgJ2RvZyddKVxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2xha2UgZmlzaCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgaWdub3JlIGNhc2UgYW5kIHB1bmN0dWF0aW9uJywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCcvQScsICdDYXQgZG9HLmNhdCcpLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQicsICdjQXQgZmlTSCcpLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQycsICdmck9nJyksXG5cdFx0XSkpIHtcblx0XHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhkb2NzKTtcblx0XHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnLiAsQ2FUISAgJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQScsICcvQiddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCBtYXRjaCBvbiBjYW1lbENhc2Ugd29yZHMnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9BJywgJ2NhdERvZyBjYXQnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0InLCAnZmlzaENhdEZpc2gnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0MnLCAnZnJvZ2NhdCcpLFxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdERPRycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnLCAnL0InXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgbm90IG1hdGNoIGRvY3VtZW50IGFmdGVyIGRlbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBkb2NBID0gbWFrZURvY3VtZW50KCcvQScsICdjYXQgZG9nIGNhdCcpO1xuXHRcdGNvbnN0IGRvY0IgPSBtYWtlRG9jdW1lbnQoJy9CJywgJ2NhdCBmaXNoJyk7XG5cdFx0Y29uc3QgZG9jQyA9IG1ha2VEb2N1bWVudCgnL0MnLCAnZnJvZycpO1xuXG5cdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKFtkb2NBLCBkb2NCLCBkb2NDXSk7XG5cdFx0bGV0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnY2F0JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnLCAnL0InXSk7XG5cblx0XHR0ZmlkZi5kZWxldGVEb2N1bWVudChkb2NBLmtleSk7XG5cdFx0c2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXQnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQiddKTtcblxuXHRcdHRmaWRmLmRlbGV0ZURvY3VtZW50KGRvY0Mua2V5KTtcblx0XHRzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJy9CJ10pO1xuXG5cdFx0dGZpZGYuZGVsZXRlRG9jdW1lbnQoZG9jQi5rZXkpO1xuXHRcdHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnY2F0JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFtdKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gbWFrZURvY3VtZW50KGtleTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcgfCBzdHJpbmdbXSk6IFRmSWRmRG9jdW1lbnQge1xuXHRyZXR1cm4ge1xuXHRcdGtleSxcblx0XHR0ZXh0Q2h1bmtzOiBBcnJheS5pc0FycmF5KGNvbnRlbnQpID8gY29udGVudCA6IFtjb250ZW50XSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUFrRDtBQUMzRCxTQUFTLCtDQUErQztBQU94RCxTQUFTLFVBQWEsS0FBaUI7QUFDdEMsTUFBSSxJQUFJLFdBQVcsR0FBRztBQUNyQixXQUFPLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDWDtBQUVBLFFBQU0sU0FBZ0IsQ0FBQztBQUV2QixXQUFTLElBQUksR0FBRyxJQUFJLElBQUksUUFBUSxLQUFLO0FBQ3BDLFVBQU0sT0FBTyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQ3JELFVBQU0sbUJBQW1CLFVBQVUsSUFBSTtBQUN2QyxhQUFTLElBQUksR0FBRyxJQUFJLGlCQUFpQixRQUFRLEtBQUs7QUFDakQsYUFBTyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENB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
