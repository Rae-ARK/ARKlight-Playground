import assert from "assert";
import { compareItemsByFuzzyScore, pieceToQuery, prepareQuery, scoreFuzzy, scoreFuzzy2, scoreItemFuzzy } from "../../common/fuzzyScorer.js";
import { Schemas } from "../../common/network.js";
import { basename, dirname, posix, sep, win32 } from "../../common/path.js";
import { isWindows } from "../../common/platform.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
class ResourceAccessorClass {
  getItemLabel(resource) {
    return basename(resource.fsPath);
  }
  getItemDescription(resource) {
    return dirname(resource.fsPath);
  }
  getItemPath(resource) {
    return resource.fsPath;
  }
}
const ResourceAccessor = new ResourceAccessorClass();
class ResourceWithSlashAccessorClass {
  getItemLabel(resource) {
    return basename(resource.fsPath);
  }
  getItemDescription(resource) {
    return posix.normalize(dirname(resource.path));
  }
  getItemPath(resource) {
    return posix.normalize(resource.path);
  }
}
const ResourceWithSlashAccessor = new ResourceWithSlashAccessorClass();
class ResourceWithBackslashAccessorClass {
  getItemLabel(resource) {
    return basename(resource.fsPath);
  }
  getItemDescription(resource) {
    return win32.normalize(dirname(resource.path));
  }
  getItemPath(resource) {
    return win32.normalize(resource.path);
  }
}
const ResourceWithBackslashAccessor = new ResourceWithBackslashAccessorClass();
class NullAccessorClass {
  getItemLabel(resource) {
    return void 0;
  }
  getItemDescription(resource) {
    return void 0;
  }
  getItemPath(resource) {
    return void 0;
  }
}
function _doScore(target, query, allowNonContiguousMatches) {
  const preparedQuery = prepareQuery(query);
  return scoreFuzzy(target, preparedQuery.normalized, preparedQuery.normalizedLowercase, allowNonContiguousMatches ?? !preparedQuery.expectContiguousMatch);
}
function _doScore2(target, query, matchOffset = 0) {
  const preparedQuery = prepareQuery(query);
  return scoreFuzzy2(target, preparedQuery, 0, matchOffset);
}
function scoreItem(item, query, allowNonContiguousMatches, accessor, cache = /* @__PURE__ */ Object.create(null)) {
  return scoreItemFuzzy(item, prepareQuery(query), allowNonContiguousMatches, accessor, cache);
}
function compareItemsByScore(itemA, itemB, query, allowNonContiguousMatches, accessor) {
  return compareItemsByFuzzyScore(itemA, itemB, prepareQuery(query), allowNonContiguousMatches, accessor, /* @__PURE__ */ Object.create(null));
}
const NullAccessor = new NullAccessorClass();
suite("Fuzzy Scorer", () => {
  test("score (fuzzy)", function() {
    const target = "HelLo-World";
    const scores = [];
    scores.push(_doScore(target, "HelLo-World", true));
    scores.push(_doScore(target, "hello-world", true));
    scores.push(_doScore(target, "HW", true));
    scores.push(_doScore(target, "hw", true));
    scores.push(_doScore(target, "H", true));
    scores.push(_doScore(target, "h", true));
    scores.push(_doScore(target, "W", true));
    scores.push(_doScore(target, "Ld", true));
    scores.push(_doScore(target, "ld", true));
    scores.push(_doScore(target, "w", true));
    scores.push(_doScore(target, "L", true));
    scores.push(_doScore(target, "l", true));
    scores.push(_doScore(target, "4", true));
    const sortedScores = scores.concat().sort((a, b) => b[0] - a[0]);
    assert.deepStrictEqual(scores, sortedScores);
  });
  test("score (non fuzzy)", function() {
    const target = "HelLo-World";
    assert.ok(_doScore(target, "HelLo-World", false)[0] > 0);
    assert.strictEqual(_doScore(target, "HelLo-World", false)[1].length, "HelLo-World".length);
    assert.ok(_doScore(target, "hello-world", false)[0] > 0);
    assert.strictEqual(_doScore(target, "HW", false)[0], 0);
    assert.ok(_doScore(target, "h", false)[0] > 0);
    assert.ok(_doScore(target, "ello", false)[0] > 0);
    assert.ok(_doScore(target, "ld", false)[0] > 0);
    assert.strictEqual(_doScore(target, "eo", false)[0], 0);
  });
  test("scoreItem - matches are proper", function() {
    let res = scoreItem(null, "something", true, ResourceAccessor);
    assert.ok(!res.score);
    const resource = URI.file("/xyz/some/path/someFile123.txt");
    res = scoreItem(resource, "something", true, NullAccessor);
    assert.ok(!res.score);
    const identityRes = scoreItem(resource, ResourceAccessor.getItemPath(resource), true, ResourceAccessor);
    assert.ok(identityRes.score);
    assert.strictEqual(identityRes.descriptionMatch.length, 1);
    assert.strictEqual(identityRes.labelMatch.length, 1);
    assert.strictEqual(identityRes.descriptionMatch[0].start, 0);
    assert.strictEqual(identityRes.descriptionMatch[0].end, ResourceAccessor.getItemDescription(resource).length);
    assert.strictEqual(identityRes.labelMatch[0].start, 0);
    assert.strictEqual(identityRes.labelMatch[0].end, ResourceAccessor.getItemLabel(resource).length);
    const basenamePrefixRes = scoreItem(resource, "som", true, ResourceAccessor);
    assert.ok(basenamePrefixRes.score);
    assert.ok(!basenamePrefixRes.descriptionMatch);
    assert.strictEqual(basenamePrefixRes.labelMatch.length, 1);
    assert.strictEqual(basenamePrefixRes.labelMatch[0].start, 0);
    assert.strictEqual(basenamePrefixRes.labelMatch[0].end, "som".length);
    const basenameCamelcaseRes = scoreItem(resource, "sF", true, ResourceAccessor);
    assert.ok(basenameCamelcaseRes.score);
    assert.ok(!basenameCamelcaseRes.descriptionMatch);
    assert.strictEqual(basenameCamelcaseRes.labelMatch.length, 2);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[0].start, 0);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[0].end, 1);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[1].start, 4);
    assert.strictEqual(basenameCamelcaseRes.labelMatch[1].end, 5);
    const basenameRes = scoreItem(resource, "of", true, ResourceAccessor);
    assert.ok(basenameRes.score);
    assert.ok(!basenameRes.descriptionMatch);
    assert.strictEqual(basenameRes.labelMatch.length, 2);
    assert.strictEqual(basenameRes.labelMatch[0].start, 1);
    assert.strictEqual(basenameRes.labelMatch[0].end, 2);
    assert.strictEqual(basenameRes.labelMatch[1].start, 4);
    assert.strictEqual(basenameRes.labelMatch[1].end, 5);
    const pathRes = scoreItem(resource, "xyz123", true, ResourceAccessor);
    assert.ok(pathRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 8);
    assert.strictEqual(pathRes.labelMatch[0].end, 11);
    assert.strictEqual(pathRes.descriptionMatch.length, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].start, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].end, 4);
    const ellipsisRes = scoreItem(resource, "\u2026me/path/someFile123.txt", true, ResourceAccessor);
    assert.ok(ellipsisRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 8);
    assert.strictEqual(pathRes.labelMatch[0].end, 11);
    assert.strictEqual(pathRes.descriptionMatch.length, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].start, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].end, 4);
    const noRes = scoreItem(resource, "987", true, ResourceAccessor);
    assert.ok(!noRes.score);
    assert.ok(!noRes.labelMatch);
    assert.ok(!noRes.descriptionMatch);
    const noExactRes = scoreItem(resource, '"sF"', true, ResourceAccessor);
    assert.ok(!noExactRes.score);
    assert.ok(!noExactRes.labelMatch);
    assert.ok(!noExactRes.descriptionMatch);
    assert.strictEqual(noRes.score, noExactRes.score);
    assert.ok(identityRes.score > basenamePrefixRes.score);
    assert.ok(basenamePrefixRes.score > basenameRes.score);
    assert.ok(basenameRes.score > pathRes.score);
    assert.ok(pathRes.score > noRes.score);
  });
  test("scoreItem - multiple", function() {
    const resource = URI.file("/xyz/some/path/someFile123.txt");
    const res1 = scoreItem(resource, "xyz some", true, ResourceAccessor);
    assert.ok(res1.score);
    assert.strictEqual(res1.labelMatch?.length, 1);
    assert.strictEqual(res1.labelMatch[0].start, 0);
    assert.strictEqual(res1.labelMatch[0].end, 4);
    assert.strictEqual(res1.descriptionMatch?.length, 1);
    assert.strictEqual(res1.descriptionMatch[0].start, 1);
    assert.strictEqual(res1.descriptionMatch[0].end, 4);
    const res2 = scoreItem(resource, "some xyz", true, ResourceAccessor);
    assert.ok(res2.score);
    assert.strictEqual(res1.score, res2.score);
    assert.strictEqual(res2.labelMatch?.length, 1);
    assert.strictEqual(res2.labelMatch[0].start, 0);
    assert.strictEqual(res2.labelMatch[0].end, 4);
    assert.strictEqual(res2.descriptionMatch?.length, 1);
    assert.strictEqual(res2.descriptionMatch[0].start, 1);
    assert.strictEqual(res2.descriptionMatch[0].end, 4);
    const res3 = scoreItem(resource, "some xyz file file123", true, ResourceAccessor);
    assert.ok(res3.score);
    assert.ok(res3.score > res2.score);
    assert.strictEqual(res3.labelMatch?.length, 1);
    assert.strictEqual(res3.labelMatch[0].start, 0);
    assert.strictEqual(res3.labelMatch[0].end, 11);
    assert.strictEqual(res3.descriptionMatch?.length, 1);
    assert.strictEqual(res3.descriptionMatch[0].start, 1);
    assert.strictEqual(res3.descriptionMatch[0].end, 4);
    const res4 = scoreItem(resource, "path z y", true, ResourceAccessor);
    assert.ok(res4.score);
    assert.ok(res4.score < res2.score);
    assert.strictEqual(res4.labelMatch?.length, 0);
    assert.strictEqual(res4.descriptionMatch?.length, 2);
    assert.strictEqual(res4.descriptionMatch[0].start, 2);
    assert.strictEqual(res4.descriptionMatch[0].end, 4);
    assert.strictEqual(res4.descriptionMatch[1].start, 10);
    assert.strictEqual(res4.descriptionMatch[1].end, 14);
  });
  test("scoreItem - multiple with cache yields different results", function() {
    const resource = URI.file("/xyz/some/path/someFile123.txt");
    const cache = {};
    const res1 = scoreItem(resource, "xyz sm", true, ResourceAccessor, cache);
    assert.ok(res1.score);
    const res2 = scoreItem(resource, 'xyz "sm"', true, ResourceAccessor, cache);
    assert.ok(!res2.score);
  });
  test("scoreItem - invalid input", function() {
    let res = scoreItem(null, null, true, ResourceAccessor);
    assert.strictEqual(res.score, 0);
    res = scoreItem(null, "null", true, ResourceAccessor);
    assert.strictEqual(res.score, 0);
  });
  test("scoreItem - optimize for file paths", function() {
    const resource = URI.file("/xyz/others/spath/some/xsp/file123.txt");
    const pathRes = scoreItem(resource, "xspfile123", true, ResourceAccessor);
    assert.ok(pathRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 0);
    assert.strictEqual(pathRes.labelMatch[0].end, 7);
    assert.strictEqual(pathRes.descriptionMatch.length, 1);
    assert.strictEqual(pathRes.descriptionMatch[0].start, 23);
    assert.strictEqual(pathRes.descriptionMatch[0].end, 26);
  });
  test("scoreItem - avoid match scattering (bug #36119)", function() {
    const resource = URI.file("projects/ui/cula/ats/target.mk");
    const pathRes = scoreItem(resource, "tcltarget.mk", true, ResourceAccessor);
    assert.ok(pathRes.score);
    assert.ok(pathRes.descriptionMatch);
    assert.ok(pathRes.labelMatch);
    assert.strictEqual(pathRes.labelMatch.length, 1);
    assert.strictEqual(pathRes.labelMatch[0].start, 0);
    assert.strictEqual(pathRes.labelMatch[0].end, 9);
  });
  test("scoreItem - prefers more compact matches", function() {
    const resource = URI.file("/1a111d1/11a1d1/something.txt");
    const res = scoreItem(resource, "ad", true, ResourceAccessor);
    assert.ok(res.score);
    assert.ok(res.descriptionMatch);
    assert.ok(!res.labelMatch.length);
    assert.strictEqual(res.descriptionMatch.length, 2);
    assert.strictEqual(res.descriptionMatch[0].start, 11);
    assert.strictEqual(res.descriptionMatch[0].end, 12);
    assert.strictEqual(res.descriptionMatch[1].start, 13);
    assert.strictEqual(res.descriptionMatch[1].end, 14);
  });
  test("scoreItem - proper target offset", function() {
    const resource = URI.file("etem");
    const res = scoreItem(resource, "teem", true, ResourceAccessor);
    assert.ok(!res.score);
  });
  test("scoreItem - proper target offset #2", function() {
    const resource = URI.file("ede");
    const res = scoreItem(resource, "de", true, ResourceAccessor);
    assert.strictEqual(res.labelMatch.length, 1);
    assert.strictEqual(res.labelMatch[0].start, 1);
    assert.strictEqual(res.labelMatch[0].end, 3);
  });
  test("scoreItem - proper target offset #3", function() {
    const resource = URI.file("/src/vs/editor/browser/viewParts/lineNumbers/flipped-cursor-2x.svg");
    const res = scoreItem(resource, "debug", true, ResourceAccessor);
    assert.strictEqual(res.descriptionMatch.length, 3);
    assert.strictEqual(res.descriptionMatch[0].start, 9);
    assert.strictEqual(res.descriptionMatch[0].end, 10);
    assert.strictEqual(res.descriptionMatch[1].start, 36);
    assert.strictEqual(res.descriptionMatch[1].end, 37);
    assert.strictEqual(res.descriptionMatch[2].start, 40);
    assert.strictEqual(res.descriptionMatch[2].end, 41);
    assert.strictEqual(res.labelMatch.length, 2);
    assert.strictEqual(res.labelMatch[0].start, 9);
    assert.strictEqual(res.labelMatch[0].end, 10);
    assert.strictEqual(res.labelMatch[1].start, 20);
    assert.strictEqual(res.labelMatch[1].end, 21);
  });
  test("scoreItem - no match unless query contained in sequence", function() {
    const resource = URI.file("abcde");
    const res = scoreItem(resource, "edcda", true, ResourceAccessor);
    assert.ok(!res.score);
  });
  test("scoreItem - match if using slash or backslash (local, remote resource)", function() {
    const localResource = URI.file("abcde/super/duper");
    const remoteResource = URI.from({ scheme: Schemas.vscodeRemote, path: "abcde/super/duper" });
    for (const resource of [localResource, remoteResource]) {
      let res = scoreItem(resource, "abcde\\super\\duper", true, ResourceAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde\\super\\duper", true, ResourceWithSlashAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde\\super\\duper", true, ResourceWithBackslashAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde/super/duper", true, ResourceAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde/super/duper", true, ResourceWithSlashAccessor);
      assert.ok(res.score);
      res = scoreItem(resource, "abcde/super/duper", true, ResourceWithBackslashAccessor);
      assert.ok(res.score);
    }
  });
  test("scoreItem - ensure upper case bonus only applies on non-consecutive matches (bug #134723)", function() {
    const resourceWithUpper = URI.file("ASDFasdfasdf");
    const resourceAllLower = URI.file("asdfasdfasdf");
    assert.ok(scoreItem(resourceAllLower, "asdf", true, ResourceAccessor).score > scoreItem(resourceWithUpper, "asdf", true, ResourceAccessor).score);
  });
  test("compareItemsByScore - identity", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = ResourceAccessor.getItemPath(resourceA);
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = ResourceAccessor.getItemPath(resourceB);
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - basename prefix", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = ResourceAccessor.getItemLabel(resourceA);
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = ResourceAccessor.getItemLabel(resourceB);
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - basename camelcase", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = "fA";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = "fB";
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - basename scores", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = "fileA";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = "fileB";
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - path scores", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    let query = "pathfileA";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    query = "pathfileB";
    res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer shorter basenames", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileBLonger.txt");
    const resourceC = URI.file("/unrelated/the/path/other/fileC.txt");
    const query = "somepath";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer shorter basenames (match on basename)", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileBLonger.txt");
    const resourceC = URI.file("/unrelated/the/path/other/fileC.txt");
    const query = "file";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
  });
  test("compareFilesByScore - prefer shorter paths", function() {
    const resourceA = URI.file("/some/path/fileA.txt");
    const resourceB = URI.file("/some/path/other/fileB.txt");
    const resourceC = URI.file("/unrelated/some/path/other/fileC.txt");
    const query = "somepath";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer shorter paths (bug #17443)", function() {
    const resourceA = URI.file("config/test/t1.js");
    const resourceB = URI.file("config/test.js");
    const resourceC = URI.file("config/test/t2.js");
    const query = "co/te";
    const res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    assert.strictEqual(res[2], resourceC);
  });
  test("compareFilesByScore - prefer matches in label over description if scores are otherwise equal", function() {
    const resourceA = URI.file("parts/quick/arrow-left-dark.svg");
    const resourceB = URI.file("parts/quickopen/quickopen.ts");
    const query = "partsquick";
    const res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer camel case matches", function() {
    const resourceA = URI.file("config/test/NullPointerException.java");
    const resourceB = URI.file("config/test/nopointerexception.java");
    for (const query of ["npe", "NPE"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer more compact camel case matches", function() {
    const resourceA = URI.file("config/test/openthisAnythingHandler.js");
    const resourceB = URI.file("config/test/openthisisnotsorelevantforthequeryAnyHand.js");
    const query = "AH";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer more compact matches (label)", function() {
    const resourceA = URI.file("config/test/examasdaple.js");
    const resourceB = URI.file("config/test/exampleasdaasd.ts");
    const query = "xp";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer more compact matches (path)", function() {
    const resourceA = URI.file("config/test/examasdaple/file.js");
    const resourceB = URI.file("config/test/exampleasdaasd/file.ts");
    const query = "xp";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - prefer more compact matches (label and path)", function() {
    const resourceA = URI.file("config/example/thisfile.ts");
    const resourceB = URI.file("config/24234243244/example/file.js");
    const query = "exfile";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - avoid match scattering (bug #34210)", function() {
    const resourceA = URI.file("node_modules1/bundle/lib/model/modules/ot1/index.js");
    const resourceB = URI.file("node_modules1/bundle/lib/model/modules/un1/index.js");
    const resourceC = URI.file("node_modules1/bundle/lib/model/modules/modu1/index.js");
    const resourceD = URI.file("node_modules1/bundle/lib/model/modules/oddl1/index.js");
    let query = isWindows ? "modu1\\index.js" : "modu1/index.js";
    let res = [resourceA, resourceB, resourceC, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    res = [resourceC, resourceB, resourceA, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    query = isWindows ? "un1\\index.js" : "un1/index.js";
    res = [resourceA, resourceB, resourceC, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceC, resourceB, resourceA, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #21019 1.)", function() {
    const resourceA = URI.file("app/containers/Services/NetworkData/ServiceDetails/ServiceLoad/index.js");
    const resourceB = URI.file("app/containers/Services/NetworkData/ServiceDetails/ServiceDistribution/index.js");
    const resourceC = URI.file("app/containers/Services/NetworkData/ServiceDetailTabs/ServiceTabs/StatVideo/index.js");
    const query = "StatVideoindex";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
  });
  test("compareFilesByScore - avoid match scattering (bug #21019 2.)", function() {
    const resourceA = URI.file("src/build-helper/store/redux.ts");
    const resourceB = URI.file("src/repository/store/redux.ts");
    const query = "reproreduxts";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #26649)", function() {
    const resourceA = URI.file("photobook/src/components/AddPagesButton/index.js");
    const resourceB = URI.file("photobook/src/components/ApprovalPageHeader/index.js");
    const resourceC = URI.file("photobook/src/canvasComponents/BookPage/index.js");
    const query = "bookpageIndex";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceC);
  });
  test("compareFilesByScore - avoid match scattering (bug #33247)", function() {
    const resourceA = URI.file("ui/src/utils/constants.js");
    const resourceB = URI.file("ui/src/ui/Icons/index.js");
    const query = isWindows ? "ui\\icons" : "ui/icons";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #33247 comment)", function() {
    const resourceA = URI.file("ui/src/components/IDInput/index.js");
    const resourceB = URI.file("ui/src/ui/Input/index.js");
    const query = isWindows ? "ui\\input\\index" : "ui/input/index";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #36166)", function() {
    const resourceA = URI.file("django/contrib/sites/locale/ga/LC_MESSAGES/django.mo");
    const resourceB = URI.file("django/core/signals.py");
    const query = "djancosig";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #32918)", function() {
    const resourceA = URI.file("adsys/protected/config.php");
    const resourceB = URI.file("adsys/protected/framework/smarty/sysplugins/smarty_internal_config.php");
    const resourceC = URI.file("duowanVideo/wap/protected/config.php");
    const query = "protectedconfig.php";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
    res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceC);
    assert.strictEqual(res[2], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #14879)", function() {
    const resourceA = URI.file("pkg/search/gradient/testdata/constraint_attrMatchString.yml");
    const resourceB = URI.file("cmd/gradient/main.go");
    const query = "gradientmain";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #14727 1)", function() {
    const resourceA = URI.file("alpha-beta-cappa.txt");
    const resourceB = URI.file("abc.txt");
    const query = "abc";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #14727 2)", function() {
    const resourceA = URI.file("xerxes-yak-zubba/index.js");
    const resourceB = URI.file("xyz/index.js");
    const query = "xyz";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #18381)", function() {
    const resourceA = URI.file("AssymblyInfo.cs");
    const resourceB = URI.file("IAsynchronousTask.java");
    const query = "async";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #35572)", function() {
    const resourceA = URI.file("static/app/source/angluar/-admin/-organization/-settings/layout/layout.js");
    const resourceB = URI.file("static/app/source/angular/-admin/-project/-settings/_settings/settings.js");
    const query = "partisettings";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #36810)", function() {
    const resourceA = URI.file("Trilby.TrilbyTV.Web.Portal/Views/Systems/Index.cshtml");
    const resourceB = URI.file("Trilby.TrilbyTV.Web.Portal/Areas/Admins/Views/Tips/Index.cshtml");
    const query = "tipsindex.cshtml";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - prefer shorter hit (bug #20546)", function() {
    const resourceA = URI.file("editor/core/components/tests/list-view-spec.js");
    const resourceB = URI.file("editor/core/components/list-view.js");
    const query = "listview";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - avoid match scattering (bug #12095)", function() {
    const resourceA = URI.file("src/vs/workbench/contrib/files/common/explorerViewModel.ts");
    const resourceB = URI.file("src/vs/workbench/contrib/files/browser/views/explorerView.ts");
    const resourceC = URI.file("src/vs/workbench/contrib/files/browser/views/explorerViewer.ts");
    const query = "filesexplorerview.ts";
    let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceA, resourceC, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - prefer case match (bug #96122)", function() {
    const resourceA = URI.file("lists.php");
    const resourceB = URI.file("lib/Lists.php");
    const query = "Lists.php";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
  });
  test("compareFilesByScore - prefer shorter match (bug #103052) - foo bar", function() {
    const resourceA = URI.file("app/emails/foo.bar.js");
    const resourceB = URI.file("app/emails/other-footer.other-bar.js");
    for (const query of ["foo bar", "foobar"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer shorter match (bug #103052) - payment model", function() {
    const resourceA = URI.file("app/components/payment/payment.model.js");
    const resourceB = URI.file("app/components/online-payments-history/online-payments-history.model.js");
    for (const query of ["payment model", "paymentmodel"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer shorter match (bug #103052) - color", function() {
    const resourceA = URI.file("app/constants/color.js");
    const resourceB = URI.file("app/components/model/input/pick-avatar-color.js");
    for (const query of ["color js", "colorjs"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceA);
      assert.strictEqual(res[1], resourceB);
    }
  });
  test("compareFilesByScore - prefer strict case prefix", function() {
    const resourceA = URI.file("app/constants/color.js");
    const resourceB = URI.file("app/components/model/input/Color.js");
    let query = "Color";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    query = "color";
    res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
  });
  test("compareFilesByScore - prefer prefix (bug #103052)", function() {
    const resourceA = URI.file("test/smoke/src/main.ts");
    const resourceB = URI.file("src/vs/editor/common/services/semantikTokensProviderStyling.ts");
    const query = "smoke main.ts";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceA);
    assert.strictEqual(res[1], resourceB);
  });
  test("compareFilesByScore - boost better prefix match if multiple queries are used", function() {
    const resourceA = URI.file("src/vs/workbench/services/host/browser/browserHostService.ts");
    const resourceB = URI.file("src/vs/workbench/browser/workbench.ts");
    for (const query of ["workbench.ts browser", "browser workbench.ts", "browser workbench", "workbench browser"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
    }
  });
  test("compareFilesByScore - boost shorter prefix match if multiple queries are used", function() {
    const resourceA = URI.file("src/vs/workbench/node/actions/windowActions.ts");
    const resourceB = URI.file("src/vs/workbench/electron-node/window.ts");
    for (const query of ["window node", "window.ts node"]) {
      let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
      res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
      assert.strictEqual(res[0], resourceB);
      assert.strictEqual(res[1], resourceA);
    }
  });
  test("compareFilesByScore - skip preference on label match when using path sep", function() {
    const resourceA = URI.file("djangosite/ufrela/def.py");
    const resourceB = URI.file("djangosite/urls/default.py");
    const query = "url/def";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - boost shorter prefix match if multiple queries are used (#99171)", function() {
    const resourceA = URI.file("mesh_editor_lifetime_job.h");
    const resourceB = URI.file("lifetime_job.h");
    const query = "m life, life m";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("compareFilesByScore - boost consecutive matches in the beginning over end", function() {
    const resourceA = URI.file("src/vs/server/node/extensionHostStatusService.ts");
    const resourceB = URI.file("src/vs/workbench/browser/parts/notifications/notificationsStatus.ts");
    const query = "notStatus";
    let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
    res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor));
    assert.strictEqual(res[0], resourceB);
    assert.strictEqual(res[1], resourceA);
  });
  test("prepareQuery", () => {
    assert.strictEqual(prepareQuery(" f*a ").normalized, "fa");
    assert.strictEqual(prepareQuery(" f\u2026a ").normalized, "fa");
    assert.strictEqual(prepareQuery("main#").normalized, "main");
    assert.strictEqual(prepareQuery("main#").original, "main#");
    assert.strictEqual(prepareQuery("foo*").normalized, "foo");
    assert.strictEqual(prepareQuery("foo*").original, "foo*");
    assert.strictEqual(prepareQuery("model Tester.ts").original, "model Tester.ts");
    assert.strictEqual(prepareQuery("model Tester.ts").originalLowercase, "model Tester.ts".toLowerCase());
    assert.strictEqual(prepareQuery("model Tester.ts").normalized, "modelTester.ts");
    assert.strictEqual(prepareQuery("model Tester.ts").expectContiguousMatch, false);
    assert.strictEqual(prepareQuery("Model Tester.ts").normalizedLowercase, "modeltester.ts");
    assert.strictEqual(prepareQuery("ModelTester.ts").containsPathSeparator, false);
    assert.strictEqual(prepareQuery("Model" + sep + "Tester.ts").containsPathSeparator, true);
    assert.strictEqual(prepareQuery('"hello"').expectContiguousMatch, true);
    assert.strictEqual(prepareQuery('"hello"').normalized, "hello");
    let query = prepareQuery("He*llo World");
    assert.strictEqual(query.original, "He*llo World");
    assert.strictEqual(query.normalized, "HelloWorld");
    assert.strictEqual(query.normalizedLowercase, "HelloWorld".toLowerCase());
    assert.strictEqual(query.values?.length, 2);
    assert.strictEqual(query.values?.[0].original, "He*llo");
    assert.strictEqual(query.values?.[0].normalized, "Hello");
    assert.strictEqual(query.values?.[0].normalizedLowercase, "Hello".toLowerCase());
    assert.strictEqual(query.values?.[1].original, "World");
    assert.strictEqual(query.values?.[1].normalized, "World");
    assert.strictEqual(query.values?.[1].normalizedLowercase, "World".toLowerCase());
    const restoredQuery = pieceToQuery(query.values);
    assert.strictEqual(restoredQuery.original, query.original);
    assert.strictEqual(restoredQuery.values?.length, query.values?.length);
    assert.strictEqual(restoredQuery.containsPathSeparator, query.containsPathSeparator);
    query = prepareQuery(" Hello   World  	");
    assert.strictEqual(query.original, " Hello   World  	");
    assert.strictEqual(query.originalLowercase, " Hello   World  	".toLowerCase());
    assert.strictEqual(query.normalized, "HelloWorld");
    assert.strictEqual(query.normalizedLowercase, "HelloWorld".toLowerCase());
    assert.strictEqual(query.values?.length, 2);
    assert.strictEqual(query.values?.[0].original, "Hello");
    assert.strictEqual(query.values?.[0].originalLowercase, "Hello".toLowerCase());
    assert.strictEqual(query.values?.[0].normalized, "Hello");
    assert.strictEqual(query.values?.[0].normalizedLowercase, "Hello".toLowerCase());
    assert.strictEqual(query.values?.[1].original, "World");
    assert.strictEqual(query.values?.[1].originalLowercase, "World".toLowerCase());
    assert.strictEqual(query.values?.[1].normalized, "World");
    assert.strictEqual(query.values?.[1].normalizedLowercase, "World".toLowerCase());
    if (isWindows) {
      assert.strictEqual(prepareQuery("C:\\some\\path").pathNormalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:\\some\\path").normalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:\\some\\path").containsPathSeparator, true);
      assert.strictEqual(prepareQuery("C:/some/path").pathNormalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:/some/path").normalized, "C:\\some\\path");
      assert.strictEqual(prepareQuery("C:/some/path").containsPathSeparator, true);
    } else {
      assert.strictEqual(prepareQuery("/some/path").pathNormalized, "/some/path");
      assert.strictEqual(prepareQuery("/some/path").normalized, "/some/path");
      assert.strictEqual(prepareQuery("/some/path").containsPathSeparator, true);
      assert.strictEqual(prepareQuery("\\some\\path").pathNormalized, "/some/path");
      assert.strictEqual(prepareQuery("\\some\\path").normalized, "/some/path");
      assert.strictEqual(prepareQuery("\\some\\path").containsPathSeparator, true);
    }
  });
  test("fuzzyScore2 (matching)", function() {
    const target = "HelLo-World";
    for (const offset of [0, 3]) {
      let [score, matches] = _doScore2(offset === 0 ? target : `123${target}`, "HelLo-World", offset);
      assert.ok(score);
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].start, 0 + offset);
      assert.strictEqual(matches[0].end, target.length + offset);
      [score, matches] = _doScore2(offset === 0 ? target : `123${target}`, "HW", offset);
      assert.ok(score);
      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0].start, 0 + offset);
      assert.strictEqual(matches[0].end, 1 + offset);
      assert.strictEqual(matches[1].start, 6 + offset);
      assert.strictEqual(matches[1].end, 7 + offset);
    }
  });
  test("fuzzyScore2 (multiple queries)", function() {
    const target = "HelLo-World";
    const [firstSingleScore, firstSingleMatches] = _doScore2(target, "HelLo");
    const [secondSingleScore, secondSingleMatches] = _doScore2(target, "World");
    const firstAndSecondSingleMatches = [...firstSingleMatches || [], ...secondSingleMatches || []];
    let [multiScore, multiMatches] = _doScore2(target, "HelLo World");
    function assertScore() {
      assert.ok((multiScore ?? 0) >= (firstSingleScore ?? 0) + (secondSingleScore ?? 0));
      for (let i = 0; multiMatches && i < multiMatches.length; i++) {
        const multiMatch = multiMatches[i];
        const firstAndSecondSingleMatch = firstAndSecondSingleMatches[i];
        if (multiMatch && firstAndSecondSingleMatch) {
          assert.strictEqual(multiMatch.start, firstAndSecondSingleMatch.start);
          assert.strictEqual(multiMatch.end, firstAndSecondSingleMatch.end);
        } else {
          assert.fail();
        }
      }
    }
    function assertNoScore() {
      assert.strictEqual(multiScore, void 0);
      assert.strictEqual(multiMatches.length, 0);
    }
    assertScore();
    [multiScore, multiMatches] = _doScore2(target, "World HelLo");
    assertScore();
    [multiScore, multiMatches] = _doScore2(target, "World HelLo World");
    assertScore();
    [multiScore, multiMatches] = _doScore2(target, "World HelLo Nothing");
    assertNoScore();
    [multiScore, multiMatches] = _doScore2(target, "More Nothing");
    assertNoScore();
  });
  test("fuzzyScore2 (#95716)", function() {
    const target = "# \u274C Wow";
    const score = _doScore2(target, "\u274C");
    assert.ok(score);
    assert.ok(typeof score[0] === "number");
    assert.ok(score[1].length > 0);
  });
  test("Using quotes should expect contiguous matches match", function() {
    assert.strictEqual(_doScore("contiguous", '"contguous"')[0], 0);
    const score = _doScore("contiguous", '"contiguous"');
    assert.ok(score[0] > 0);
  });
  test("Using quotes should highlight contiguous indexes", function() {
    const score = _doScore("2021-7-26.md", '"26"');
    assert.strictEqual(score[0], 14);
    assert.strictEqual(score[1][0], 7);
    assert.strictEqual(score[1][1], 8);
  });
  test("Workspace symbol search with special characters (#, *)", function() {
    let query = prepareQuery("main#");
    assert.strictEqual(query.original, "main#");
    assert.strictEqual(query.normalized, "main");
    let [score, matches] = _doScore2("main", "main#");
    assert.ok(typeof score === "number" && score > 0, 'Should match "main" symbol when query is "main#"');
    assert.ok(matches.length > 0);
    query = prepareQuery("foo*");
    assert.strictEqual(query.original, "foo*");
    assert.strictEqual(query.normalized, "foo");
    [score, matches] = _doScore2("foo", "foo*");
    assert.ok(typeof score === "number" && score > 0, 'Should match "foo" symbol when query is "foo*"');
    assert.ok(matches.length > 0);
    query = prepareQuery("MyClass#*");
    assert.strictEqual(query.original, "MyClass#*");
    assert.strictEqual(query.normalized, "MyClass");
    [score, matches] = _doScore2("MyClass", "MyClass#*");
    assert.ok(typeof score === "number" && score > 0, 'Should match "MyClass" symbol when query is "MyClass#*"');
    assert.ok(matches.length > 0);
    query = prepareQuery("MC#");
    assert.strictEqual(query.original, "MC#");
    assert.strictEqual(query.normalized, "MC");
    [score, matches] = _doScore2("MyClass", "MC#");
    assert.ok(typeof score === "number" && score > 0, 'Should fuzzy match "MyClass" symbol when query is "MC#"');
    assert.ok(matches.length > 0);
    query = prepareQuery("#SpecialFunction");
    assert.strictEqual(query.original, "#SpecialFunction");
    assert.strictEqual(query.normalized, "#SpecialFunction");
    [score, matches] = _doScore2("#SpecialFunction", "#SpecialFunction");
    assert.ok(typeof score === "number" && score > 0, 'Should match "#SpecialFunction" symbol when query is "#SpecialFunction"');
    assert.ok(matches.length > 0);
    query = prepareQuery("#");
    assert.strictEqual(query.original, "#");
    assert.strictEqual(query.normalized, "#", "Standalone # should not be removed");
    [score, matches] = _doScore2("#", "#");
    assert.ok(typeof score === "number" && score > 0, 'Should match "#" symbol when query is "#"');
    assert.ok(matches.length > 0);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZnV6enlTY29yZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNvbXBhcmVJdGVtc0J5RnV6enlTY29yZSwgRnV6enlTY29yZSwgRnV6enlTY29yZTIsIEZ1enp5U2NvcmVyQ2FjaGUsIElJdGVtQWNjZXNzb3IsIElJdGVtU2NvcmUsIHBpZWNlVG9RdWVyeSwgcHJlcGFyZVF1ZXJ5LCBzY29yZUZ1enp5LCBzY29yZUZ1enp5Miwgc2NvcmVJdGVtRnV6enkgfSBmcm9tICcuLi8uLi9jb21tb24vZnV6enlTY29yZXIuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBwb3NpeCwgc2VwLCB3aW4zMiB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5jbGFzcyBSZXNvdXJjZUFjY2Vzc29yQ2xhc3MgaW1wbGVtZW50cyBJSXRlbUFjY2Vzc29yPFVSST4ge1xuXG5cdGdldEl0ZW1MYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYmFzZW5hbWUocmVzb3VyY2UuZnNQYXRoKTtcblx0fVxuXG5cdGdldEl0ZW1EZXNjcmlwdGlvbihyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZGlybmFtZShyZXNvdXJjZS5mc1BhdGgpO1xuXHR9XG5cblx0Z2V0SXRlbVBhdGgocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHJlc291cmNlLmZzUGF0aDtcblx0fVxufVxuXG5jb25zdCBSZXNvdXJjZUFjY2Vzc29yID0gbmV3IFJlc291cmNlQWNjZXNzb3JDbGFzcygpO1xuXG5jbGFzcyBSZXNvdXJjZVdpdGhTbGFzaEFjY2Vzc29yQ2xhc3MgaW1wbGVtZW50cyBJSXRlbUFjY2Vzc29yPFVSST4ge1xuXG5cdGdldEl0ZW1MYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYmFzZW5hbWUocmVzb3VyY2UuZnNQYXRoKTtcblx0fVxuXG5cdGdldEl0ZW1EZXNjcmlwdGlvbihyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcG9zaXgubm9ybWFsaXplKGRpcm5hbWUocmVzb3VyY2UucGF0aCkpO1xuXHR9XG5cblx0Z2V0SXRlbVBhdGgocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHBvc2l4Lm5vcm1hbGl6ZShyZXNvdXJjZS5wYXRoKTtcblx0fVxufVxuXG5jb25zdCBSZXNvdXJjZVdpdGhTbGFzaEFjY2Vzc29yID0gbmV3IFJlc291cmNlV2l0aFNsYXNoQWNjZXNzb3JDbGFzcygpO1xuXG5jbGFzcyBSZXNvdXJjZVdpdGhCYWNrc2xhc2hBY2Nlc3NvckNsYXNzIGltcGxlbWVudHMgSUl0ZW1BY2Nlc3NvcjxVUkk+IHtcblxuXHRnZXRJdGVtTGFiZWwocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKHJlc291cmNlLmZzUGF0aCk7XG5cdH1cblxuXHRnZXRJdGVtRGVzY3JpcHRpb24ocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHdpbjMyLm5vcm1hbGl6ZShkaXJuYW1lKHJlc291cmNlLnBhdGgpKTtcblx0fVxuXG5cdGdldEl0ZW1QYXRoKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB3aW4zMi5ub3JtYWxpemUocmVzb3VyY2UucGF0aCk7XG5cdH1cbn1cblxuY29uc3QgUmVzb3VyY2VXaXRoQmFja3NsYXNoQWNjZXNzb3IgPSBuZXcgUmVzb3VyY2VXaXRoQmFja3NsYXNoQWNjZXNzb3JDbGFzcygpO1xuXG5jbGFzcyBOdWxsQWNjZXNzb3JDbGFzcyBpbXBsZW1lbnRzIElJdGVtQWNjZXNzb3I8VVJJPiB7XG5cblx0Z2V0SXRlbUxhYmVsKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB1bmRlZmluZWQhO1xuXHR9XG5cblx0Z2V0SXRlbURlc2NyaXB0aW9uKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB1bmRlZmluZWQhO1xuXHR9XG5cblx0Z2V0SXRlbVBhdGgocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZCE7XG5cdH1cbn1cblxuZnVuY3Rpb24gX2RvU2NvcmUodGFyZ2V0OiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM/OiBib29sZWFuKTogRnV6enlTY29yZSB7XG5cdGNvbnN0IHByZXBhcmVkUXVlcnkgPSBwcmVwYXJlUXVlcnkocXVlcnkpO1xuXG5cdHJldHVybiBzY29yZUZ1enp5KHRhcmdldCwgcHJlcGFyZWRRdWVyeS5ub3JtYWxpemVkLCBwcmVwYXJlZFF1ZXJ5Lm5vcm1hbGl6ZWRMb3dlcmNhc2UsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXMgPz8gIXByZXBhcmVkUXVlcnkuZXhwZWN0Q29udGlndW91c01hdGNoKTtcbn1cblxuZnVuY3Rpb24gX2RvU2NvcmUyKHRhcmdldDogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCBtYXRjaE9mZnNldDogbnVtYmVyID0gMCk6IEZ1enp5U2NvcmUyIHtcblx0Y29uc3QgcHJlcGFyZWRRdWVyeSA9IHByZXBhcmVRdWVyeShxdWVyeSk7XG5cblx0cmV0dXJuIHNjb3JlRnV6enkyKHRhcmdldCwgcHJlcGFyZWRRdWVyeSwgMCwgbWF0Y2hPZmZzZXQpO1xufVxuXG5mdW5jdGlvbiBzY29yZUl0ZW08VD4oaXRlbTogVCwgcXVlcnk6IHN0cmluZywgYWxsb3dOb25Db250aWd1b3VzTWF0Y2hlczogYm9vbGVhbiwgYWNjZXNzb3I6IElJdGVtQWNjZXNzb3I8VD4sIGNhY2hlOiBGdXp6eVNjb3JlckNhY2hlID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IElJdGVtU2NvcmUge1xuXHRyZXR1cm4gc2NvcmVJdGVtRnV6enkoaXRlbSwgcHJlcGFyZVF1ZXJ5KHF1ZXJ5KSwgYWxsb3dOb25Db250aWd1b3VzTWF0Y2hlcywgYWNjZXNzb3IsIGNhY2hlKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUl0ZW1zQnlTY29yZTxUPihpdGVtQTogVCwgaXRlbUI6IFQsIHF1ZXJ5OiBzdHJpbmcsIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXM6IGJvb2xlYW4sIGFjY2Vzc29yOiBJSXRlbUFjY2Vzc29yPFQ+KTogbnVtYmVyIHtcblx0cmV0dXJuIGNvbXBhcmVJdGVtc0J5RnV6enlTY29yZShpdGVtQSwgaXRlbUIsIHByZXBhcmVRdWVyeShxdWVyeSksIGFsbG93Tm9uQ29udGlndW91c01hdGNoZXMsIGFjY2Vzc29yLCBPYmplY3QuY3JlYXRlKG51bGwpKTtcbn1cblxuY29uc3QgTnVsbEFjY2Vzc29yID0gbmV3IE51bGxBY2Nlc3NvckNsYXNzKCk7XG5cbnN1aXRlKCdGdXp6eSBTY29yZXInLCAoKSA9PiB7XG5cblx0dGVzdCgnc2NvcmUgKGZ1enp5KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0YXJnZXQgPSAnSGVsTG8tV29ybGQnO1xuXG5cdFx0Y29uc3Qgc2NvcmVzOiBGdXp6eVNjb3JlW10gPSBbXTtcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdIZWxMby1Xb3JsZCcsIHRydWUpKTsgLy8gZGlyZWN0IGNhc2UgbWF0Y2hcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdoZWxsby13b3JsZCcsIHRydWUpKTsgLy8gZGlyZWN0IG1peC1jYXNlIG1hdGNoXG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnSFcnLCB0cnVlKSk7IC8vIGRpcmVjdCBjYXNlIHByZWZpeCAobXVsdGlwbGUpXG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnaHcnLCB0cnVlKSk7IC8vIGRpcmVjdCBtaXgtY2FzZSBwcmVmaXggKG11bHRpcGxlKVxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ0gnLCB0cnVlKSk7IC8vIGRpcmVjdCBjYXNlIHByZWZpeFxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ2gnLCB0cnVlKSk7IC8vIGRpcmVjdCBtaXgtY2FzZSBwcmVmaXhcblx0XHRzY29yZXMucHVzaChfZG9TY29yZSh0YXJnZXQsICdXJywgdHJ1ZSkpOyAvLyBkaXJlY3QgY2FzZSB3b3JkIHByZWZpeFxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ0xkJywgdHJ1ZSkpOyAvLyBpbi1zdHJpbmcgY2FzZSBtYXRjaCAobXVsdGlwbGUpXG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnbGQnLCB0cnVlKSk7IC8vIGluLXN0cmluZyBtaXgtY2FzZSBtYXRjaCAoY29uc2VjdXRpdmUsIGF2b2lkcyBzY2F0dGVyZWQgaGl0KVxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ3cnLCB0cnVlKSk7IC8vIGRpcmVjdCBtaXgtY2FzZSB3b3JkIHByZWZpeFxuXHRcdHNjb3Jlcy5wdXNoKF9kb1Njb3JlKHRhcmdldCwgJ0wnLCB0cnVlKSk7IC8vIGluLXN0cmluZyBjYXNlIG1hdGNoXG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnbCcsIHRydWUpKTsgLy8gaW4tc3RyaW5nIG1peC1jYXNlIG1hdGNoXG5cdFx0c2NvcmVzLnB1c2goX2RvU2NvcmUodGFyZ2V0LCAnNCcsIHRydWUpKTsgLy8gbm8gbWF0Y2hcblxuXHRcdC8vIEFzc2VydCBzY29yaW5nIG9yZGVyXG5cdFx0Y29uc3Qgc29ydGVkU2NvcmVzID0gc2NvcmVzLmNvbmNhdCgpLnNvcnQoKGEsIGIpID0+IGJbMF0gLSBhWzBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNjb3Jlcywgc29ydGVkU2NvcmVzKTtcblxuXHRcdC8vIEFzc2VydCBzY29yaW5nIHBvc2l0aW9uc1xuXHRcdC8vIGxldCBwb3NpdGlvbnMgPSBzY29yZXNbMF1bMV07XG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKHBvc2l0aW9ucy5sZW5ndGgsICdIZWxMby1Xb3JsZCcubGVuZ3RoKTtcblxuXHRcdC8vIHBvc2l0aW9ucyA9IHNjb3Jlc1syXVsxXTtcblx0XHQvLyBhc3NlcnQuc3RyaWN0RXF1YWwocG9zaXRpb25zLmxlbmd0aCwgJ0hXJy5sZW5ndGgpO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbnNbMF0sIDApO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbnNbMV0sIDYpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZSAobm9uIGZ1enp5KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0YXJnZXQgPSAnSGVsTG8tV29ybGQnO1xuXG5cdFx0YXNzZXJ0Lm9rKF9kb1Njb3JlKHRhcmdldCwgJ0hlbExvLVdvcmxkJywgZmFsc2UpWzBdID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9kb1Njb3JlKHRhcmdldCwgJ0hlbExvLVdvcmxkJywgZmFsc2UpWzFdLmxlbmd0aCwgJ0hlbExvLVdvcmxkJy5sZW5ndGgpO1xuXG5cdFx0YXNzZXJ0Lm9rKF9kb1Njb3JlKHRhcmdldCwgJ2hlbGxvLXdvcmxkJywgZmFsc2UpWzBdID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9kb1Njb3JlKHRhcmdldCwgJ0hXJywgZmFsc2UpWzBdLCAwKTtcblx0XHRhc3NlcnQub2soX2RvU2NvcmUodGFyZ2V0LCAnaCcsIGZhbHNlKVswXSA+IDApO1xuXHRcdGFzc2VydC5vayhfZG9TY29yZSh0YXJnZXQsICdlbGxvJywgZmFsc2UpWzBdID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKF9kb1Njb3JlKHRhcmdldCwgJ2xkJywgZmFsc2UpWzBdID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9kb1Njb3JlKHRhcmdldCwgJ2VvJywgZmFsc2UpWzBdLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gbWF0Y2hlcyBhcmUgcHJvcGVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCByZXMgPSBzY29yZUl0ZW0obnVsbCwgJ3NvbWV0aGluZycsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayghcmVzLnNjb3JlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy94eXovc29tZS9wYXRoL3NvbWVGaWxlMTIzLnR4dCcpO1xuXG5cdFx0cmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnc29tZXRoaW5nJywgdHJ1ZSwgTnVsbEFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soIXJlcy5zY29yZSk7XG5cblx0XHQvLyBQYXRoIElkZW50aXR5XG5cdFx0Y29uc3QgaWRlbnRpdHlSZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsIFJlc291cmNlQWNjZXNzb3IuZ2V0SXRlbVBhdGgocmVzb3VyY2UpLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soaWRlbnRpdHlSZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZGVudGl0eVJlcy5kZXNjcmlwdGlvbk1hdGNoIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZGVudGl0eVJlcy5sYWJlbE1hdGNoIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZGVudGl0eVJlcy5kZXNjcmlwdGlvbk1hdGNoIVswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkZW50aXR5UmVzLmRlc2NyaXB0aW9uTWF0Y2ghWzBdLmVuZCwgUmVzb3VyY2VBY2Nlc3Nvci5nZXRJdGVtRGVzY3JpcHRpb24ocmVzb3VyY2UpLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkZW50aXR5UmVzLmxhYmVsTWF0Y2ghWzBdLnN0YXJ0LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRlbnRpdHlSZXMubGFiZWxNYXRjaCFbMF0uZW5kLCBSZXNvdXJjZUFjY2Vzc29yLmdldEl0ZW1MYWJlbChyZXNvdXJjZSkubGVuZ3RoKTtcblxuXHRcdC8vIEJhc2VuYW1lIFByZWZpeFxuXHRcdGNvbnN0IGJhc2VuYW1lUHJlZml4UmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnc29tJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lUHJlZml4UmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2soIWJhc2VuYW1lUHJlZml4UmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVByZWZpeFJlcy5sYWJlbE1hdGNoIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVByZWZpeFJlcy5sYWJlbE1hdGNoIVswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lUHJlZml4UmVzLmxhYmVsTWF0Y2ghWzBdLmVuZCwgJ3NvbScubGVuZ3RoKTtcblxuXHRcdC8vIEJhc2VuYW1lIENhbWVsY2FzZVxuXHRcdGNvbnN0IGJhc2VuYW1lQ2FtZWxjYXNlUmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnc0YnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soYmFzZW5hbWVDYW1lbGNhc2VSZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5vayghYmFzZW5hbWVDYW1lbGNhc2VSZXMuZGVzY3JpcHRpb25NYXRjaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lQ2FtZWxjYXNlUmVzLmxhYmVsTWF0Y2ghLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lQ2FtZWxjYXNlUmVzLmxhYmVsTWF0Y2ghWzBdLnN0YXJ0LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVDYW1lbGNhc2VSZXMubGFiZWxNYXRjaCFbMF0uZW5kLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVDYW1lbGNhc2VSZXMubGFiZWxNYXRjaCFbMV0uc3RhcnQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZUNhbWVsY2FzZVJlcy5sYWJlbE1hdGNoIVsxXS5lbmQsIDUpO1xuXG5cdFx0Ly8gQmFzZW5hbWUgTWF0Y2hcblx0XHRjb25zdCBiYXNlbmFtZVJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ29mJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2soIWJhc2VuYW1lUmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVJlcy5sYWJlbE1hdGNoIS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZVJlcy5sYWJlbE1hdGNoIVswXS5zdGFydCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lUmVzLmxhYmVsTWF0Y2ghWzBdLmVuZCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lUmVzLmxhYmVsTWF0Y2ghWzFdLnN0YXJ0LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWVSZXMubGFiZWxNYXRjaCFbMV0uZW5kLCA1KTtcblxuXHRcdC8vIFBhdGggTWF0Y2hcblx0XHRjb25zdCBwYXRoUmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAneHl6MTIzJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLmxhYmVsTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2gubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoWzBdLnN0YXJ0LCA4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoWzBdLmVuZCwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2gubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLnN0YXJ0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgNCk7XG5cblx0XHQvLyBFbGxpcHNpcyBNYXRjaFxuXHRcdGNvbnN0IGVsbGlwc2lzUmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnXHUyMDI2bWUvcGF0aC9zb21lRmlsZTEyMy50eHQnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soZWxsaXBzaXNSZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLmxhYmVsTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2gubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoWzBdLnN0YXJ0LCA4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoWzBdLmVuZCwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2gubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLnN0YXJ0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgNCk7XG5cblx0XHQvLyBObyBNYXRjaFxuXHRcdGNvbnN0IG5vUmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnOTg3JywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKCFub1Jlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKCFub1Jlcy5sYWJlbE1hdGNoKTtcblx0XHRhc3NlcnQub2soIW5vUmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXG5cdFx0Ly8gTm8gRXhhY3QgTWF0Y2hcblx0XHRjb25zdCBub0V4YWN0UmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnXCJzRlwiJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0Lm9rKCFub0V4YWN0UmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2soIW5vRXhhY3RSZXMubGFiZWxNYXRjaCk7XG5cdFx0YXNzZXJ0Lm9rKCFub0V4YWN0UmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub1Jlcy5zY29yZSwgbm9FeGFjdFJlcy5zY29yZSk7XG5cblx0XHQvLyBWZXJpZnkgU2NvcmVzXG5cdFx0YXNzZXJ0Lm9rKGlkZW50aXR5UmVzLnNjb3JlID4gYmFzZW5hbWVQcmVmaXhSZXMuc2NvcmUpO1xuXHRcdGFzc2VydC5vayhiYXNlbmFtZVByZWZpeFJlcy5zY29yZSA+IGJhc2VuYW1lUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2soYmFzZW5hbWVSZXMuc2NvcmUgPiBwYXRoUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5zY29yZSA+IG5vUmVzLnNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gbXVsdGlwbGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3h5ei9zb21lL3BhdGgvc29tZUZpbGUxMjMudHh0Jyk7XG5cblx0XHRjb25zdCByZXMxID0gc2NvcmVJdGVtKHJlc291cmNlLCAneHl6IHNvbWUnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socmVzMS5zY29yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEubGFiZWxNYXRjaD8ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMS5sYWJlbE1hdGNoWzBdLnN0YXJ0LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMS5sYWJlbE1hdGNoWzBdLmVuZCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEuZGVzY3JpcHRpb25NYXRjaD8ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMS5kZXNjcmlwdGlvbk1hdGNoWzBdLnN0YXJ0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMS5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgNCk7XG5cblx0XHRjb25zdCByZXMyID0gc2NvcmVJdGVtKHJlc291cmNlLCAnc29tZSB4eXonLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socmVzMi5zY29yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczEuc2NvcmUsIHJlczIuc2NvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMyLmxhYmVsTWF0Y2g/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczIubGFiZWxNYXRjaFswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczIubGFiZWxNYXRjaFswXS5lbmQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMyLmRlc2NyaXB0aW9uTWF0Y2g/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczIuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczIuZGVzY3JpcHRpb25NYXRjaFswXS5lbmQsIDQpO1xuXG5cdFx0Y29uc3QgcmVzMyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3NvbWUgeHl6IGZpbGUgZmlsZTEyMycsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayhyZXMzLnNjb3JlKTtcblx0XHRhc3NlcnQub2socmVzMy5zY29yZSA+IHJlczIuc2NvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLmxhYmVsTWF0Y2g/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczMubGFiZWxNYXRjaFswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczMubGFiZWxNYXRjaFswXS5lbmQsIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzMy5kZXNjcmlwdGlvbk1hdGNoPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLmRlc2NyaXB0aW9uTWF0Y2hbMF0uc3RhcnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLmRlc2NyaXB0aW9uTWF0Y2hbMF0uZW5kLCA0KTtcblxuXHRcdGNvbnN0IHJlczQgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdwYXRoIHogeScsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayhyZXM0LnNjb3JlKTtcblx0XHRhc3NlcnQub2socmVzNC5zY29yZSA8IHJlczIuc2NvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM0LmxhYmVsTWF0Y2g/Lmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczQuZGVzY3JpcHRpb25NYXRjaD8ubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzNC5kZXNjcmlwdGlvbk1hdGNoWzBdLnN0YXJ0LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzNC5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczQuZGVzY3JpcHRpb25NYXRjaFsxXS5zdGFydCwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM0LmRlc2NyaXB0aW9uTWF0Y2hbMV0uZW5kLCAxNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIG11bHRpcGxlIHdpdGggY2FjaGUgeWllbGRzIGRpZmZlcmVudCByZXN1bHRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy94eXovc29tZS9wYXRoL3NvbWVGaWxlMTIzLnR4dCcpO1xuXHRcdGNvbnN0IGNhY2hlID0ge307XG5cdFx0Y29uc3QgcmVzMSA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3h5eiBzbScsIHRydWUsIFJlc291cmNlQWNjZXNzb3IsIGNhY2hlKTtcblx0XHRhc3NlcnQub2socmVzMS5zY29yZSk7XG5cblx0XHQvLyBmcm9tIHRoZSBjYWNoZSdzIHBlcnNwZWN0aXZlIHRoaXMgc2hvdWxkIGJlIGEgdG90YWxseSBkaWZmZXJlbnQgcXVlcnlcblx0XHRjb25zdCByZXMyID0gc2NvcmVJdGVtKHJlc291cmNlLCAneHl6IFwic21cIicsIHRydWUsIFJlc291cmNlQWNjZXNzb3IsIGNhY2hlKTtcblx0XHRhc3NlcnQub2soIXJlczIuc2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZUl0ZW0gLSBpbnZhbGlkIGlucHV0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHJlcyA9IHNjb3JlSXRlbShudWxsLCBudWxsISwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zY29yZSwgMCk7XG5cblx0XHRyZXMgPSBzY29yZUl0ZW0obnVsbCwgJ251bGwnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnNjb3JlLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gb3B0aW1pemUgZm9yIGZpbGUgcGF0aHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3h5ei9vdGhlcnMvc3BhdGgvc29tZS94c3AvZmlsZTEyMy50eHQnKTtcblxuXHRcdC8vIHhzcCBpcyBtb3JlIHJlbGV2YW50IHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUgcGF0aCBldmVuIHRob3VnaCBpdCBtYXRjaGVzXG5cdFx0Ly8gZnV6enkgYWxzbyBpbiB0aGUgYmVnaW5uaW5nLiB3ZSB2ZXJpZnkgdGhlIG1vcmUgcmVsZXZhbnQgbWF0Y2ggYXQgdGhlXG5cdFx0Ly8gZW5kIGdldHMgcmV0dXJuZWQuXG5cdFx0Y29uc3QgcGF0aFJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3hzcGZpbGUxMjMnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5zY29yZSk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaCk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhSZXMubGFiZWxNYXRjaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2hbMF0uc3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmxhYmVsTWF0Y2hbMF0uZW5kLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMuZGVzY3JpcHRpb25NYXRjaFswXS5zdGFydCwgMjMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoUmVzLmRlc2NyaXB0aW9uTWF0Y2hbMF0uZW5kLCAyNik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzYxMTkpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3Byb2plY3RzL3VpL2N1bGEvYXRzL3RhcmdldC5taycpO1xuXG5cdFx0Y29uc3QgcGF0aFJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ3RjbHRhcmdldC5taycsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayhwYXRoUmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5kZXNjcmlwdGlvbk1hdGNoKTtcblx0XHRhc3NlcnQub2socGF0aFJlcy5sYWJlbE1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aFJlcy5sYWJlbE1hdGNoLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaFswXS5zdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhSZXMubGFiZWxNYXRjaFswXS5lbmQsIDkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZUl0ZW0gLSBwcmVmZXJzIG1vcmUgY29tcGFjdCBtYXRjaGVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy8xYTExMWQxLzExYTFkMS9zb21ldGhpbmcudHh0Jyk7XG5cblx0XHQvLyBleHBlY3QgXCJhZFwiIHRvIGJlIG1hdGNoZWQgdG93YXJkcyB0aGUgZW5kIG9mIHRoZSBmaWxlIGJlY2F1c2UgdGhlXG5cdFx0Ly8gbWF0Y2ggaXMgbW9yZSBjb21wYWN0XG5cdFx0Y29uc3QgcmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnYWQnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2socmVzLnNjb3JlKTtcblx0XHRhc3NlcnQub2socmVzLmRlc2NyaXB0aW9uTWF0Y2gpO1xuXHRcdGFzc2VydC5vayghcmVzLmxhYmVsTWF0Y2ghLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZXNjcmlwdGlvbk1hdGNoLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLnN0YXJ0LCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZXNjcmlwdGlvbk1hdGNoWzBdLmVuZCwgMTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaFsxXS5zdGFydCwgMTMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaFsxXS5lbmQsIDE0KTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gcHJvcGVyIHRhcmdldCBvZmZzZXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnZXRlbScpO1xuXG5cdFx0Y29uc3QgcmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAndGVlbScsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXHRcdGFzc2VydC5vayghcmVzLnNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gcHJvcGVyIHRhcmdldCBvZmZzZXQgIzInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnZWRlJyk7XG5cblx0XHRjb25zdCByZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdkZScsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5sYWJlbE1hdGNoIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGFiZWxNYXRjaCFbMF0uc3RhcnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGFiZWxNYXRjaCFbMF0uZW5kLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gcHJvcGVyIHRhcmdldCBvZmZzZXQgIzMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3NyYy92cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvbGluZU51bWJlcnMvZmxpcHBlZC1jdXJzb3ItMnguc3ZnJyk7XG5cblx0XHRjb25zdCByZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdkZWJ1ZycsIHRydWUsIFJlc291cmNlQWNjZXNzb3IpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZXNjcmlwdGlvbk1hdGNoIS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCFbMF0uc3RhcnQsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCFbMF0uZW5kLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZXNjcmlwdGlvbk1hdGNoIVsxXS5zdGFydCwgMzYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCFbMV0uZW5kLCAzNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZXNjcmlwdGlvbk1hdGNoIVsyXS5zdGFydCwgNDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVzY3JpcHRpb25NYXRjaCFbMl0uZW5kLCA0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxhYmVsTWF0Y2ghLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5sYWJlbE1hdGNoIVswXS5zdGFydCwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5sYWJlbE1hdGNoIVswXS5lbmQsIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxhYmVsTWF0Y2ghWzFdLnN0YXJ0LCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5sYWJlbE1hdGNoIVsxXS5lbmQsIDIxKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gbm8gbWF0Y2ggdW5sZXNzIHF1ZXJ5IGNvbnRhaW5lZCBpbiBzZXF1ZW5jZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdhYmNkZScpO1xuXG5cdFx0Y29uc3QgcmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnZWRjZGEnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRhc3NlcnQub2soIXJlcy5zY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlSXRlbSAtIG1hdGNoIGlmIHVzaW5nIHNsYXNoIG9yIGJhY2tzbGFzaCAobG9jYWwsIHJlbW90ZSByZXNvdXJjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbG9jYWxSZXNvdXJjZSA9IFVSSS5maWxlKCdhYmNkZS9zdXBlci9kdXBlcicpO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBwYXRoOiAnYWJjZGUvc3VwZXIvZHVwZXInIH0pO1xuXG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBbbG9jYWxSZXNvdXJjZSwgcmVtb3RlUmVzb3VyY2VdKSB7XG5cdFx0XHRsZXQgcmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnYWJjZGVcXFxcc3VwZXJcXFxcZHVwZXInLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKTtcblx0XHRcdGFzc2VydC5vayhyZXMuc2NvcmUpO1xuXG5cdFx0XHRyZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdhYmNkZVxcXFxzdXBlclxcXFxkdXBlcicsIHRydWUsIFJlc291cmNlV2l0aFNsYXNoQWNjZXNzb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcy5zY29yZSk7XG5cblx0XHRcdHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ2FiY2RlXFxcXHN1cGVyXFxcXGR1cGVyJywgdHJ1ZSwgUmVzb3VyY2VXaXRoQmFja3NsYXNoQWNjZXNzb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcy5zY29yZSk7XG5cblx0XHRcdHJlcyA9IHNjb3JlSXRlbShyZXNvdXJjZSwgJ2FiY2RlL3N1cGVyL2R1cGVyJywgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3Nvcik7XG5cdFx0XHRhc3NlcnQub2socmVzLnNjb3JlKTtcblxuXHRcdFx0cmVzID0gc2NvcmVJdGVtKHJlc291cmNlLCAnYWJjZGUvc3VwZXIvZHVwZXInLCB0cnVlLCBSZXNvdXJjZVdpdGhTbGFzaEFjY2Vzc29yKTtcblx0XHRcdGFzc2VydC5vayhyZXMuc2NvcmUpO1xuXG5cdFx0XHRyZXMgPSBzY29yZUl0ZW0ocmVzb3VyY2UsICdhYmNkZS9zdXBlci9kdXBlcicsIHRydWUsIFJlc291cmNlV2l0aEJhY2tzbGFzaEFjY2Vzc29yKTtcblx0XHRcdGFzc2VydC5vayhyZXMuc2NvcmUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2NvcmVJdGVtIC0gZW5zdXJlIHVwcGVyIGNhc2UgYm9udXMgb25seSBhcHBsaWVzIG9uIG5vbi1jb25zZWN1dGl2ZSBtYXRjaGVzIChidWcgIzEzNDcyMyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VXaXRoVXBwZXIgPSBVUkkuZmlsZSgnQVNERmFzZGZhc2RmJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VBbGxMb3dlciA9IFVSSS5maWxlKCdhc2RmYXNkZmFzZGYnKTtcblxuXHRcdGFzc2VydC5vayhzY29yZUl0ZW0ocmVzb3VyY2VBbGxMb3dlciwgJ2FzZGYnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKS5zY29yZSA+IHNjb3JlSXRlbShyZXNvdXJjZVdpdGhVcHBlciwgJ2FzZGYnLCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKS5zY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVJdGVtc0J5U2NvcmUgLSBpZGVudGl0eScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9maWxlQS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9vdGhlci9maWxlQi50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnL3VucmVsYXRlZC9zb21lL3BhdGgvb3RoZXIvZmlsZUMudHh0Jyk7XG5cblx0XHQvLyBGdWxsIHJlc291cmNlIEEgcGF0aFxuXHRcdGxldCBxdWVyeSA9IFJlc291cmNlQWNjZXNzb3IuZ2V0SXRlbVBhdGgocmVzb3VyY2VBKTtcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0Ly8gRnVsbCByZXNvdXJjZSBCIHBhdGhcblx0XHRxdWVyeSA9IFJlc291cmNlQWNjZXNzb3IuZ2V0SXRlbVBhdGgocmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBiYXNlbmFtZSBwcmVmaXgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvc29tZS9wYXRoL290aGVyL2ZpbGVDLnR4dCcpO1xuXG5cdFx0Ly8gRnVsbCByZXNvdXJjZSBBIGJhc2VuYW1lXG5cdFx0bGV0IHF1ZXJ5ID0gUmVzb3VyY2VBY2Nlc3Nvci5nZXRJdGVtTGFiZWwocmVzb3VyY2VBKTtcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0Ly8gRnVsbCByZXNvdXJjZSBCIGJhc2VuYW1lXG5cdFx0cXVlcnkgPSBSZXNvdXJjZUFjY2Vzc29yLmdldEl0ZW1MYWJlbChyZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGJhc2VuYW1lIGNhbWVsY2FzZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9maWxlQS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9vdGhlci9maWxlQi50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnL3VucmVsYXRlZC9zb21lL3BhdGgvb3RoZXIvZmlsZUMudHh0Jyk7XG5cblx0XHQvLyByZXNvdXJjZSBBIGNhbWVsY2FzZVxuXHRcdGxldCBxdWVyeSA9ICdmQSc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdC8vIHJlc291cmNlIEIgY2FtZWxjYXNlXG5cdFx0cXVlcnkgPSAnZkInO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGJhc2VuYW1lIHNjb3JlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9maWxlQS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9vdGhlci9maWxlQi50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnL3VucmVsYXRlZC9zb21lL3BhdGgvb3RoZXIvZmlsZUMudHh0Jyk7XG5cblx0XHQvLyBSZXNvdXJjZSBBIHBhcnQgb2YgYmFzZW5hbWVcblx0XHRsZXQgcXVlcnkgPSAnZmlsZUEnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHQvLyBSZXNvdXJjZSBCIHBhcnQgb2YgYmFzZW5hbWVcblx0XHRxdWVyeSA9ICdmaWxlQic7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcGF0aCBzY29yZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZmlsZUEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvb3RoZXIvZmlsZUIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvc29tZS9wYXRoL290aGVyL2ZpbGVDLnR4dCcpO1xuXG5cdFx0Ly8gUmVzb3VyY2UgQSBwYXJ0IG9mIHBhdGhcblx0XHRsZXQgcXVlcnkgPSAncGF0aGZpbGVBJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUMsIHJlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0Ly8gUmVzb3VyY2UgQiBwYXJ0IG9mIHBhdGhcblx0XHRxdWVyeSA9ICdwYXRoZmlsZUInO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBzaG9ydGVyIGJhc2VuYW1lcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9maWxlQS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9vdGhlci9maWxlQkxvbmdlci50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnL3VucmVsYXRlZC90aGUvcGF0aC9vdGhlci9maWxlQy50eHQnKTtcblxuXHRcdC8vIFJlc291cmNlIEEgcGFydCBvZiBwYXRoXG5cdFx0Y29uc3QgcXVlcnkgPSAnc29tZXBhdGgnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc2hvcnRlciBiYXNlbmFtZXMgKG1hdGNoIG9uIGJhc2VuYW1lKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9maWxlQS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9vdGhlci9maWxlQkxvbmdlci50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgnL3VucmVsYXRlZC90aGUvcGF0aC9vdGhlci9maWxlQy50eHQnKTtcblxuXHRcdC8vIFJlc291cmNlIEEgcGFydCBvZiBwYXRoXG5cdFx0Y29uc3QgcXVlcnkgPSAnZmlsZSc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBzaG9ydGVyIHBhdGhzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCcvc29tZS9wYXRoL2ZpbGVBLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCcvc29tZS9wYXRoL290aGVyL2ZpbGVCLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCcvdW5yZWxhdGVkL3NvbWUvcGF0aC9vdGhlci9maWxlQy50eHQnKTtcblxuXHRcdC8vIFJlc291cmNlIEEgcGFydCBvZiBwYXRoXG5cdFx0Y29uc3QgcXVlcnkgPSAnc29tZXBhdGgnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQiwgcmVzb3VyY2VDXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc2hvcnRlciBwYXRocyAoYnVnICMxNzQ0MyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0L3QxLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJ2NvbmZpZy90ZXN0L3QyLmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdjby90ZSc7XG5cblx0XHRjb25zdCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBtYXRjaGVzIGluIGxhYmVsIG92ZXIgZGVzY3JpcHRpb24gaWYgc2NvcmVzIGFyZSBvdGhlcndpc2UgZXF1YWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3BhcnRzL3F1aWNrL2Fycm93LWxlZnQtZGFyay5zdmcnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgncGFydHMvcXVpY2tvcGVuL3F1aWNrb3Blbi50cycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAncGFydHNxdWljayc7XG5cblx0XHRjb25zdCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIGNhbWVsIGNhc2UgbWF0Y2hlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3QvTnVsbFBvaW50ZXJFeGNlcHRpb24uamF2YScpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdjb25maWcvdGVzdC9ub3BvaW50ZXJleGNlcHRpb24uamF2YScpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVyeSBvZiBbJ25wZScsICdOUEUnXSkge1xuXHRcdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXG5cdFx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgbW9yZSBjb21wYWN0IGNhbWVsIGNhc2UgbWF0Y2hlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3Qvb3BlbnRoaXNBbnl0aGluZ0hhbmRsZXIuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3Qvb3BlbnRoaXNpc25vdHNvcmVsZXZhbnRmb3J0aGVxdWVyeUFueUhhbmQuanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ0FIJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBtb3JlIGNvbXBhY3QgbWF0Y2hlcyAobGFiZWwpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdjb25maWcvdGVzdC9leGFtYXNkYXBsZS5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdjb25maWcvdGVzdC9leGFtcGxlYXNkYWFzZC50cycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAneHAnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIG1vcmUgY29tcGFjdCBtYXRjaGVzIChwYXRoKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnY29uZmlnL3Rlc3QvZXhhbWFzZGFwbGUvZmlsZS5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdjb25maWcvdGVzdC9leGFtcGxlYXNkYWFzZC9maWxlLnRzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICd4cCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgbW9yZSBjb21wYWN0IG1hdGNoZXMgKGxhYmVsIGFuZCBwYXRoKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnY29uZmlnL2V4YW1wbGUvdGhpc2ZpbGUudHMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnY29uZmlnLzI0MjM0MjQzMjQ0L2V4YW1wbGUvZmlsZS5qcycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnZXhmaWxlJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzQyMTApJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdub2RlX21vZHVsZXMxL2J1bmRsZS9saWIvbW9kZWwvbW9kdWxlcy9vdDEvaW5kZXguanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnbm9kZV9tb2R1bGVzMS9idW5kbGUvbGliL21vZGVsL21vZHVsZXMvdW4xL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJ25vZGVfbW9kdWxlczEvYnVuZGxlL2xpYi9tb2RlbC9tb2R1bGVzL21vZHUxL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VEID0gVVJJLmZpbGUoJ25vZGVfbW9kdWxlczEvYnVuZGxlL2xpYi9tb2RlbC9tb2R1bGVzL29kZGwxL2luZGV4LmpzJyk7XG5cblx0XHRsZXQgcXVlcnkgPSBpc1dpbmRvd3MgPyAnbW9kdTFcXFxcaW5kZXguanMnIDogJ21vZHUxL2luZGV4LmpzJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQywgcmVzb3VyY2VEXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQyk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQSwgcmVzb3VyY2VEXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQyk7XG5cblx0XHRxdWVyeSA9IGlzV2luZG93cyA/ICd1bjFcXFxcaW5kZXguanMnIDogJ3VuMS9pbmRleC5qcyc7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQywgcmVzb3VyY2VEXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQSwgcmVzb3VyY2VEXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzIxMDE5IDEuKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnYXBwL2NvbnRhaW5lcnMvU2VydmljZXMvTmV0d29ya0RhdGEvU2VydmljZURldGFpbHMvU2VydmljZUxvYWQvaW5kZXguanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnYXBwL2NvbnRhaW5lcnMvU2VydmljZXMvTmV0d29ya0RhdGEvU2VydmljZURldGFpbHMvU2VydmljZURpc3RyaWJ1dGlvbi9pbmRleC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQyA9IFVSSS5maWxlKCdhcHAvY29udGFpbmVycy9TZXJ2aWNlcy9OZXR3b3JrRGF0YS9TZXJ2aWNlRGV0YWlsVGFicy9TZXJ2aWNlVGFicy9TdGF0VmlkZW8vaW5kZXguanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ1N0YXRWaWRlb2luZGV4JztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMjEwMTkgMi4pJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdzcmMvYnVpbGQtaGVscGVyL3N0b3JlL3JlZHV4LnRzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3NyYy9yZXBvc2l0b3J5L3N0b3JlL3JlZHV4LnRzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdyZXByb3JlZHV4dHMnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzI2NjQ5KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgncGhvdG9ib29rL3NyYy9jb21wb25lbnRzL0FkZFBhZ2VzQnV0dG9uL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3Bob3RvYm9vay9zcmMvY29tcG9uZW50cy9BcHByb3ZhbFBhZ2VIZWFkZXIvaW5kZXguanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUMgPSBVUkkuZmlsZSgncGhvdG9ib29rL3NyYy9jYW52YXNDb21wb25lbnRzL0Jvb2tQYWdlL2luZGV4LmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdib29rcGFnZUluZGV4JztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUIsIHJlc291cmNlQ10uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUMpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQywgcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VDKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzMyNDcpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCd1aS9zcmMvdXRpbHMvY29uc3RhbnRzLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3VpL3NyYy91aS9JY29ucy9pbmRleC5qcycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSBpc1dpbmRvd3MgPyAndWlcXFxcaWNvbnMnIDogJ3VpL2ljb25zJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMzMzI0NyBjb21tZW50KScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgndWkvc3JjL2NvbXBvbmVudHMvSURJbnB1dC9pbmRleC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCd1aS9zcmMvdWkvSW5wdXQvaW5kZXguanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gaXNXaW5kb3dzID8gJ3VpXFxcXGlucHV0XFxcXGluZGV4JyA6ICd1aS9pbnB1dC9pbmRleCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzYxNjYpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdkamFuZ28vY29udHJpYi9zaXRlcy9sb2NhbGUvZ2EvTENfTUVTU0FHRVMvZGphbmdvLm1vJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2RqYW5nby9jb3JlL3NpZ25hbHMucHknKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2RqYW5jb3NpZyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMzI5MTgpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdhZHN5cy9wcm90ZWN0ZWQvY29uZmlnLnBocCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdhZHN5cy9wcm90ZWN0ZWQvZnJhbWV3b3JrL3NtYXJ0eS9zeXNwbHVnaW5zL3NtYXJ0eV9pbnRlcm5hbF9jb25maWcucGhwJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJ2R1b3dhblZpZGVvL3dhcC9wcm90ZWN0ZWQvY29uZmlnLnBocCcpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAncHJvdGVjdGVkY29uZmlnLnBocCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VDLCByZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMTQ4NzkpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdwa2cvc2VhcmNoL2dyYWRpZW50L3Rlc3RkYXRhL2NvbnN0cmFpbnRfYXR0ck1hdGNoU3RyaW5nLnltbCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdjbWQvZ3JhZGllbnQvbWFpbi5nbycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnZ3JhZGllbnRtYWluJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMxNDcyNyAxKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnYWxwaGEtYmV0YS1jYXBwYS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnYWJjLnR4dCcpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnYWJjJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMxNDcyNyAyKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgneGVyeGVzLXlhay16dWJiYS9pbmRleC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCd4eXovaW5kZXguanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3h5eic7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGF2b2lkIG1hdGNoIHNjYXR0ZXJpbmcgKGJ1ZyAjMTgzODEpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdBc3N5bWJseUluZm8uY3MnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnSUFzeW5jaHJvbm91c1Rhc2suamF2YScpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnYXN5bmMnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBhdm9pZCBtYXRjaCBzY2F0dGVyaW5nIChidWcgIzM1NTcyKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnc3RhdGljL2FwcC9zb3VyY2UvYW5nbHVhci8tYWRtaW4vLW9yZ2FuaXphdGlvbi8tc2V0dGluZ3MvbGF5b3V0L2xheW91dC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdzdGF0aWMvYXBwL3NvdXJjZS9hbmd1bGFyLy1hZG1pbi8tcHJvamVjdC8tc2V0dGluZ3MvX3NldHRpbmdzL3NldHRpbmdzLmpzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdwYXJ0aXNldHRpbmdzJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMzNjgxMCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ1RyaWxieS5UcmlsYnlUVi5XZWIuUG9ydGFsL1ZpZXdzL1N5c3RlbXMvSW5kZXguY3NodG1sJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ1RyaWxieS5UcmlsYnlUVi5XZWIuUG9ydGFsL0FyZWFzL0FkbWlucy9WaWV3cy9UaXBzL0luZGV4LmNzaHRtbCcpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAndGlwc2luZGV4LmNzaHRtbCc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBzaG9ydGVyIGhpdCAoYnVnICMyMDU0NiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2VkaXRvci9jb3JlL2NvbXBvbmVudHMvdGVzdHMvbGlzdC12aWV3LXNwZWMuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnZWRpdG9yL2NvcmUvY29tcG9uZW50cy9saXN0LXZpZXcuanMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ2xpc3R2aWV3JztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYXZvaWQgbWF0Y2ggc2NhdHRlcmluZyAoYnVnICMxMjA5NSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3NyYy92cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy9jb21tb24vZXhwbG9yZXJWaWV3TW9kZWwudHMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvdmlld3MvZXhwbG9yZXJWaWV3LnRzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VDID0gVVJJLmZpbGUoJ3NyYy92cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL3ZpZXdzL2V4cGxvcmVyVmlld2VyLnRzJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdmaWxlc2V4cGxvcmVydmlldy50cyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCLCByZXNvdXJjZUNdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQywgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgY2FzZSBtYXRjaCAoYnVnICM5NjEyMiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2xpc3RzLnBocCcpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdsaWIvTGlzdHMucGhwJyk7XG5cblx0XHRjb25zdCBxdWVyeSA9ICdMaXN0cy5waHAnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBwcmVmZXIgc2hvcnRlciBtYXRjaCAoYnVnICMxMDMwNTIpIC0gZm9vIGJhcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnYXBwL2VtYWlscy9mb28uYmFyLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2FwcC9lbWFpbHMvb3RoZXItZm9vdGVyLm90aGVyLWJhci5qcycpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVyeSBvZiBbJ2ZvbyBiYXInLCAnZm9vYmFyJ10pIHtcblx0XHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblxuXHRcdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIHNob3J0ZXIgbWF0Y2ggKGJ1ZyAjMTAzMDUyKSAtIHBheW1lbnQgbW9kZWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2FwcC9jb21wb25lbnRzL3BheW1lbnQvcGF5bWVudC5tb2RlbC5qcycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdhcHAvY29tcG9uZW50cy9vbmxpbmUtcGF5bWVudHMtaGlzdG9yeS9vbmxpbmUtcGF5bWVudHMtaGlzdG9yeS5tb2RlbC5qcycpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVyeSBvZiBbJ3BheW1lbnQgbW9kZWwnLCAncGF5bWVudG1vZGVsJ10pIHtcblx0XHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblxuXHRcdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gcHJlZmVyIHNob3J0ZXIgbWF0Y2ggKGJ1ZyAjMTAzMDUyKSAtIGNvbG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdhcHAvY29uc3RhbnRzL2NvbG9yLmpzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ2FwcC9jb21wb25lbnRzL21vZGVsL2lucHV0L3BpY2stYXZhdGFyLWNvbG9yLmpzJyk7XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXJ5IG9mIFsnY29sb3IganMnLCAnY29sb3JqcyddKSB7XG5cdFx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cblx0XHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBzdHJpY3QgY2FzZSBwcmVmaXgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ2FwcC9jb25zdGFudHMvY29sb3IuanMnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnYXBwL2NvbXBvbmVudHMvbW9kZWwvaW5wdXQvQ29sb3IuanMnKTtcblxuXHRcdGxldCBxdWVyeSA9ICdDb2xvcic7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRxdWVyeSA9ICdjb2xvcic7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VBKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUIpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHByZWZlciBwcmVmaXggKGJ1ZyAjMTAzMDUyKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgndGVzdC9zbW9rZS9zcmMvbWFpbi50cycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdzcmMvdnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpa1Rva2Vuc1Byb3ZpZGVyU3R5bGluZy50cycpO1xuXG5cdFx0Y29uc3QgcXVlcnkgPSAnc21va2UgbWFpbi50cyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VCKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBib29zdCBiZXR0ZXIgcHJlZml4IG1hdGNoIGlmIG11bHRpcGxlIHF1ZXJpZXMgYXJlIHVzZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLmZpbGUoJ3NyYy92cy93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2Jyb3dzZXJIb3N0U2VydmljZS50cycpO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL2Jyb3dzZXIvd29ya2JlbmNoLnRzJyk7XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXJ5IG9mIFsnd29ya2JlbmNoLnRzIGJyb3dzZXInLCAnYnJvd3NlciB3b3JrYmVuY2gudHMnLCAnYnJvd3NlciB3b3JrYmVuY2gnLCAnd29ya2JlbmNoIGJyb3dzZXInXSkge1xuXHRcdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVGaWxlc0J5U2NvcmUgLSBib29zdCBzaG9ydGVyIHByZWZpeCBtYXRjaCBpZiBtdWx0aXBsZSBxdWVyaWVzIGFyZSB1c2VkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdzcmMvdnMvd29ya2JlbmNoL25vZGUvYWN0aW9ucy93aW5kb3dBY3Rpb25zLnRzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3NyYy92cy93b3JrYmVuY2gvZWxlY3Ryb24tbm9kZS93aW5kb3cudHMnKTtcblxuXHRcdGZvciAoY29uc3QgcXVlcnkgb2YgWyd3aW5kb3cgbm9kZScsICd3aW5kb3cudHMgbm9kZSddKSB7XG5cdFx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIHNraXAgcHJlZmVyZW5jZSBvbiBsYWJlbCBtYXRjaCB3aGVuIHVzaW5nIHBhdGggc2VwJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5maWxlKCdkamFuZ29zaXRlL3VmcmVsYS9kZWYucHknKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnZGphbmdvc2l0ZS91cmxzL2RlZmF1bHQucHknKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ3VybC9kZWYnO1xuXG5cdFx0bGV0IHJlcyA9IFtyZXNvdXJjZUEsIHJlc291cmNlQl0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cblx0XHRyZXMgPSBbcmVzb3VyY2VCLCByZXNvdXJjZUFdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlRmlsZXNCeVNjb3JlIC0gYm9vc3Qgc2hvcnRlciBwcmVmaXggbWF0Y2ggaWYgbXVsdGlwbGUgcXVlcmllcyBhcmUgdXNlZCAoIzk5MTcxKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnbWVzaF9lZGl0b3JfbGlmZXRpbWVfam9iLmgnKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkuZmlsZSgnbGlmZXRpbWVfam9iLmgnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ20gbGlmZSwgbGlmZSBtJztcblxuXHRcdGxldCByZXMgPSBbcmVzb3VyY2VBLCByZXNvdXJjZUJdLnNvcnQoKHIxLCByMikgPT4gY29tcGFyZUl0ZW1zQnlTY29yZShyMSwgcjIsIHF1ZXJ5LCB0cnVlLCBSZXNvdXJjZUFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgcmVzb3VyY2VCKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCByZXNvdXJjZUEpO1xuXG5cdFx0cmVzID0gW3Jlc291cmNlQiwgcmVzb3VyY2VBXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUZpbGVzQnlTY29yZSAtIGJvb3N0IGNvbnNlY3V0aXZlIG1hdGNoZXMgaW4gdGhlIGJlZ2lubmluZyBvdmVyIGVuZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkuZmlsZSgnc3JjL3ZzL3NlcnZlci9ub2RlL2V4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlLnRzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLmZpbGUoJ3NyYy92cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNTdGF0dXMudHMnKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gJ25vdFN0YXR1cyc7XG5cblx0XHRsZXQgcmVzID0gW3Jlc291cmNlQSwgcmVzb3VyY2VCXS5zb3J0KChyMSwgcjIpID0+IGNvbXBhcmVJdGVtc0J5U2NvcmUocjEsIHIyLCBxdWVyeSwgdHJ1ZSwgUmVzb3VyY2VBY2Nlc3NvcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIHJlc291cmNlQik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgcmVzb3VyY2VBKTtcblxuXHRcdHJlcyA9IFtyZXNvdXJjZUIsIHJlc291cmNlQV0uc29ydCgocjEsIHIyKSA9PiBjb21wYXJlSXRlbXNCeVNjb3JlKHIxLCByMiwgcXVlcnksIHRydWUsIFJlc291cmNlQWNjZXNzb3IpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCByZXNvdXJjZUIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIHJlc291cmNlQSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVRdWVyeScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCcgZiphICcpLm5vcm1hbGl6ZWQsICdmYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJyBmXHUyMDI2YSAnKS5ub3JtYWxpemVkLCAnZmEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdtYWluIycpLm5vcm1hbGl6ZWQsICdtYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnbWFpbiMnKS5vcmlnaW5hbCwgJ21haW4jJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnZm9vKicpLm5vcm1hbGl6ZWQsICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdmb28qJykub3JpZ2luYWwsICdmb28qJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnbW9kZWwgVGVzdGVyLnRzJykub3JpZ2luYWwsICdtb2RlbCBUZXN0ZXIudHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdtb2RlbCBUZXN0ZXIudHMnKS5vcmlnaW5hbExvd2VyY2FzZSwgJ21vZGVsIFRlc3Rlci50cycudG9Mb3dlckNhc2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnbW9kZWwgVGVzdGVyLnRzJykubm9ybWFsaXplZCwgJ21vZGVsVGVzdGVyLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnbW9kZWwgVGVzdGVyLnRzJykuZXhwZWN0Q29udGlndW91c01hdGNoLCBmYWxzZSk7IC8vIGRvZXNuJ3QgaGF2ZSBxdW90ZXMgaW4gaXRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdNb2RlbCBUZXN0ZXIudHMnKS5ub3JtYWxpemVkTG93ZXJjYXNlLCAnbW9kZWx0ZXN0ZXIudHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdNb2RlbFRlc3Rlci50cycpLmNvbnRhaW5zUGF0aFNlcGFyYXRvciwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ01vZGVsJyArIHNlcCArICdUZXN0ZXIudHMnKS5jb250YWluc1BhdGhTZXBhcmF0b3IsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ1wiaGVsbG9cIicpLmV4cGVjdENvbnRpZ3VvdXNNYXRjaCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnXCJoZWxsb1wiJykubm9ybWFsaXplZCwgJ2hlbGxvJyk7XG5cblx0XHQvLyB3aXRoIHNwYWNlc1xuXHRcdGxldCBxdWVyeSA9IHByZXBhcmVRdWVyeSgnSGUqbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm9yaWdpbmFsLCAnSGUqbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWQsICdIZWxsb1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWRMb3dlcmNhc2UsICdIZWxsb1dvcmxkJy50b0xvd2VyQ2FzZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlswXS5vcmlnaW5hbCwgJ0hlKmxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlswXS5ub3JtYWxpemVkLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMF0ubm9ybWFsaXplZExvd2VyY2FzZSwgJ0hlbGxvJy50b0xvd2VyQ2FzZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMV0ub3JpZ2luYWwsICdXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlsxXS5ub3JtYWxpemVkLCAnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMV0ubm9ybWFsaXplZExvd2VyY2FzZSwgJ1dvcmxkJy50b0xvd2VyQ2FzZSgpKTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkUXVlcnkgPSBwaWVjZVRvUXVlcnkocXVlcnkudmFsdWVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWRRdWVyeS5vcmlnaW5hbCwgcXVlcnkub3JpZ2luYWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZFF1ZXJ5LnZhbHVlcz8ubGVuZ3RoLCBxdWVyeS52YWx1ZXM/Lmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkUXVlcnkuY29udGFpbnNQYXRoU2VwYXJhdG9yLCBxdWVyeS5jb250YWluc1BhdGhTZXBhcmF0b3IpO1xuXG5cdFx0Ly8gd2l0aCBzcGFjZXMgdGhhdCBhcmUgZW1wdHlcblx0XHRxdWVyeSA9IHByZXBhcmVRdWVyeSgnIEhlbGxvICAgV29ybGQgIFx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm9yaWdpbmFsLCAnIEhlbGxvICAgV29ybGQgIFx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm9yaWdpbmFsTG93ZXJjYXNlLCAnIEhlbGxvICAgV29ybGQgIFx0Jy50b0xvd2VyQ2FzZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkubm9ybWFsaXplZCwgJ0hlbGxvV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkubm9ybWFsaXplZExvd2VyY2FzZSwgJ0hlbGxvV29ybGQnLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzBdLm9yaWdpbmFsLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMF0ub3JpZ2luYWxMb3dlcmNhc2UsICdIZWxsbycudG9Mb3dlckNhc2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzBdLm5vcm1hbGl6ZWQsICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlswXS5ub3JtYWxpemVkTG93ZXJjYXNlLCAnSGVsbG8nLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlsxXS5vcmlnaW5hbCwgJ1dvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnZhbHVlcz8uWzFdLm9yaWdpbmFsTG93ZXJjYXNlLCAnV29ybGQnLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS52YWx1ZXM/LlsxXS5ub3JtYWxpemVkLCAnV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkudmFsdWVzPy5bMV0ubm9ybWFsaXplZExvd2VyY2FzZSwgJ1dvcmxkJy50b0xvd2VyQ2FzZSgpKTtcblxuXHRcdC8vIFBhdGggcmVsYXRlZFxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ0M6XFxcXHNvbWVcXFxccGF0aCcpLnBhdGhOb3JtYWxpemVkLCAnQzpcXFxcc29tZVxcXFxwYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdDOlxcXFxzb21lXFxcXHBhdGgnKS5ub3JtYWxpemVkLCAnQzpcXFxcc29tZVxcXFxwYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdDOlxcXFxzb21lXFxcXHBhdGgnKS5jb250YWluc1BhdGhTZXBhcmF0b3IsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnQzovc29tZS9wYXRoJykucGF0aE5vcm1hbGl6ZWQsICdDOlxcXFxzb21lXFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ0M6L3NvbWUvcGF0aCcpLm5vcm1hbGl6ZWQsICdDOlxcXFxzb21lXFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ0M6L3NvbWUvcGF0aCcpLmNvbnRhaW5zUGF0aFNlcGFyYXRvciwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJy9zb21lL3BhdGgnKS5wYXRoTm9ybWFsaXplZCwgJy9zb21lL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJy9zb21lL3BhdGgnKS5ub3JtYWxpemVkLCAnL3NvbWUvcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVRdWVyeSgnL3NvbWUvcGF0aCcpLmNvbnRhaW5zUGF0aFNlcGFyYXRvciwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdcXFxcc29tZVxcXFxwYXRoJykucGF0aE5vcm1hbGl6ZWQsICcvc29tZS9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVF1ZXJ5KCdcXFxcc29tZVxcXFxwYXRoJykubm9ybWFsaXplZCwgJy9zb21lL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlUXVlcnkoJ1xcXFxzb21lXFxcXHBhdGgnKS5jb250YWluc1BhdGhTZXBhcmF0b3IsIHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZnV6enlTY29yZTIgKG1hdGNoaW5nKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0YXJnZXQgPSAnSGVsTG8tV29ybGQnO1xuXG5cdFx0Zm9yIChjb25zdCBvZmZzZXQgb2YgWzAsIDNdKSB7XG5cdFx0XHRsZXQgW3Njb3JlLCBtYXRjaGVzXSA9IF9kb1Njb3JlMihvZmZzZXQgPT09IDAgPyB0YXJnZXQgOiBgMTIzJHt0YXJnZXR9YCwgJ0hlbExvLVdvcmxkJywgb2Zmc2V0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNjb3JlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc1swXS5zdGFydCwgMCArIG9mZnNldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc1swXS5lbmQsIHRhcmdldC5sZW5ndGggKyBvZmZzZXQpO1xuXG5cdFx0XHRbc2NvcmUsIG1hdGNoZXNdID0gX2RvU2NvcmUyKG9mZnNldCA9PT0gMCA/IHRhcmdldCA6IGAxMjMke3RhcmdldH1gLCAnSFcnLCBvZmZzZXQpO1xuXG5cdFx0XHRhc3NlcnQub2soc2NvcmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzWzBdLnN0YXJ0LCAwICsgb2Zmc2V0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzWzBdLmVuZCwgMSArIG9mZnNldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc1sxXS5zdGFydCwgNiArIG9mZnNldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc1sxXS5lbmQsIDcgKyBvZmZzZXQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZnV6enlTY29yZTIgKG11bHRpcGxlIHF1ZXJpZXMpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRhcmdldCA9ICdIZWxMby1Xb3JsZCc7XG5cblx0XHRjb25zdCBbZmlyc3RTaW5nbGVTY29yZSwgZmlyc3RTaW5nbGVNYXRjaGVzXSA9IF9kb1Njb3JlMih0YXJnZXQsICdIZWxMbycpO1xuXHRcdGNvbnN0IFtzZWNvbmRTaW5nbGVTY29yZSwgc2Vjb25kU2luZ2xlTWF0Y2hlc10gPSBfZG9TY29yZTIodGFyZ2V0LCAnV29ybGQnKTtcblx0XHRjb25zdCBmaXJzdEFuZFNlY29uZFNpbmdsZU1hdGNoZXMgPSBbLi4uZmlyc3RTaW5nbGVNYXRjaGVzIHx8IFtdLCAuLi5zZWNvbmRTaW5nbGVNYXRjaGVzIHx8IFtdXTtcblxuXHRcdGxldCBbbXVsdGlTY29yZSwgbXVsdGlNYXRjaGVzXSA9IF9kb1Njb3JlMih0YXJnZXQsICdIZWxMbyBXb3JsZCcpO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0U2NvcmUoKSB7XG5cdFx0XHRhc3NlcnQub2soKG11bHRpU2NvcmUgPz8gMCkgPj0gKChmaXJzdFNpbmdsZVNjb3JlID8/IDApICsgKHNlY29uZFNpbmdsZVNjb3JlID8/IDApKSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgbXVsdGlNYXRjaGVzICYmIGkgPCBtdWx0aU1hdGNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbXVsdGlNYXRjaCA9IG11bHRpTWF0Y2hlc1tpXTtcblx0XHRcdFx0Y29uc3QgZmlyc3RBbmRTZWNvbmRTaW5nbGVNYXRjaCA9IGZpcnN0QW5kU2Vjb25kU2luZ2xlTWF0Y2hlc1tpXTtcblxuXHRcdFx0XHRpZiAobXVsdGlNYXRjaCAmJiBmaXJzdEFuZFNlY29uZFNpbmdsZU1hdGNoKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG11bHRpTWF0Y2guc3RhcnQsIGZpcnN0QW5kU2Vjb25kU2luZ2xlTWF0Y2guc3RhcnQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtdWx0aU1hdGNoLmVuZCwgZmlyc3RBbmRTZWNvbmRTaW5nbGVNYXRjaC5lbmQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBhc3NlcnROb1Njb3JlKCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG11bHRpU2NvcmUsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXVsdGlNYXRjaGVzLmxlbmd0aCwgMCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0U2NvcmUoKTtcblxuXHRcdFttdWx0aVNjb3JlLCBtdWx0aU1hdGNoZXNdID0gX2RvU2NvcmUyKHRhcmdldCwgJ1dvcmxkIEhlbExvJyk7XG5cdFx0YXNzZXJ0U2NvcmUoKTtcblxuXHRcdFttdWx0aVNjb3JlLCBtdWx0aU1hdGNoZXNdID0gX2RvU2NvcmUyKHRhcmdldCwgJ1dvcmxkIEhlbExvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0U2NvcmUoKTtcblxuXHRcdFttdWx0aVNjb3JlLCBtdWx0aU1hdGNoZXNdID0gX2RvU2NvcmUyKHRhcmdldCwgJ1dvcmxkIEhlbExvIE5vdGhpbmcnKTtcblx0XHRhc3NlcnROb1Njb3JlKCk7XG5cblx0XHRbbXVsdGlTY29yZSwgbXVsdGlNYXRjaGVzXSA9IF9kb1Njb3JlMih0YXJnZXQsICdNb3JlIE5vdGhpbmcnKTtcblx0XHRhc3NlcnROb1Njb3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUyICgjOTU3MTYpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRhcmdldCA9ICcjIFx1Mjc0QyBXb3cnO1xuXG5cdFx0Y29uc3Qgc2NvcmUgPSBfZG9TY29yZTIodGFyZ2V0LCAnXHUyNzRDJyk7XG5cdFx0YXNzZXJ0Lm9rKHNjb3JlKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNjb3JlWzBdID09PSAnbnVtYmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHNjb3JlWzFdLmxlbmd0aCA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdVc2luZyBxdW90ZXMgc2hvdWxkIGV4cGVjdCBjb250aWd1b3VzIG1hdGNoZXMgbWF0Y2gnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gbWlzc2luZyB0aGUgXCJpXCIgaW4gdGhlIHF1ZXJ5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9kb1Njb3JlKCdjb250aWd1b3VzJywgJ1wiY29udGd1b3VzXCInKVswXSwgMCk7XG5cblx0XHRjb25zdCBzY29yZSA9IF9kb1Njb3JlKCdjb250aWd1b3VzJywgJ1wiY29udGlndW91c1wiJyk7XG5cdFx0YXNzZXJ0Lm9rKHNjb3JlWzBdID4gMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VzaW5nIHF1b3RlcyBzaG91bGQgaGlnaGxpZ2h0IGNvbnRpZ3VvdXMgaW5kZXhlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzY29yZSA9IF9kb1Njb3JlKCcyMDIxLTctMjYubWQnLCAnXCIyNlwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlWzBdLCAxNCk7XG5cblx0XHQvLyBUaGUgaW5kZXhlcyBvZiB0aGUgMiBhbmQgNiBvZiBcIjI2XCJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmVbMV1bMF0sIDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZVsxXVsxXSwgOCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dvcmtzcGFjZSBzeW1ib2wgc2VhcmNoIHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzICgjLCAqKScsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBTaW11bGF0ZXMgdGhlIHNjZW5hcmlvIGZyb20gdGhlIGlzc3VlIHdoZXJlIHJ1c3QtYW5hbHl6ZXIgdXNlcyAjIGFuZCAqIGFzIHF1ZXJ5IG1vZGlmaWVyc1xuXHRcdC8vIFRoZSBvcmlnaW5hbCBxdWVyeSAod2l0aCBzcGVjaWFsIGNoYXJzKSBzaG91bGQgcmVhY2ggdGhlIGxhbmd1YWdlIHNlcnZlclxuXHRcdC8vIGJ1dCBub3JtYWxpemVkIHF1ZXJ5ICh3aXRob3V0IHNwZWNpYWwgY2hhcnMpIHNob3VsZCBiZSB1c2VkIGZvciBmdXp6eSBtYXRjaGluZ1xuXG5cdFx0Ly8gVGVzdCAjOiBVc2VyIHR5cGVzIFwibWFpbiNcIiwgbGFuZ3VhZ2Ugc2VydmVyIHJldHVybnMgXCJtYWluXCIgc3ltYm9sXG5cdFx0bGV0IHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KCdtYWluIycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5vcmlnaW5hbCwgJ21haW4jJyk7IC8vIFNlbnQgdG8gbGFuZ3VhZ2Ugc2VydmVyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWQsICdtYWluJyk7IC8vIFVzZWQgZm9yIGZ1enp5IG1hdGNoaW5nXG5cdFx0bGV0IFtzY29yZSwgbWF0Y2hlc10gPSBfZG9TY29yZTIoJ21haW4nLCAnbWFpbiMnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNjb3JlID09PSAnbnVtYmVyJyAmJiBzY29yZSA+IDAsICdTaG91bGQgbWF0Y2ggXCJtYWluXCIgc3ltYm9sIHdoZW4gcXVlcnkgaXMgXCJtYWluI1wiJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoZXMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBUZXN0ICo6IFVzZXIgdHlwZXMgXCJmb28qXCIsIGxhbmd1YWdlIHNlcnZlciByZXR1cm5zIFwiZm9vXCIgc3ltYm9sXG5cdFx0cXVlcnkgPSBwcmVwYXJlUXVlcnkoJ2ZvbyonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkub3JpZ2luYWwsICdmb28qJyk7IC8vIFNlbnQgdG8gbGFuZ3VhZ2Ugc2VydmVyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWQsICdmb28nKTsgLy8gVXNlZCBmb3IgZnV6enkgbWF0Y2hpbmdcblx0XHRbc2NvcmUsIG1hdGNoZXNdID0gX2RvU2NvcmUyKCdmb28nLCAnZm9vKicpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygc2NvcmUgPT09ICdudW1iZXInICYmIHNjb3JlID4gMCwgJ1Nob3VsZCBtYXRjaCBcImZvb1wiIHN5bWJvbCB3aGVuIHF1ZXJ5IGlzIFwiZm9vKlwiJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoZXMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBUZXN0IGJvdGg6IFVzZXIgdHlwZXMgXCJNeUNsYXNzIypcIiwgc2hvdWxkIG1hdGNoIFwiTXlDbGFzc1wiXG5cdFx0cXVlcnkgPSBwcmVwYXJlUXVlcnkoJ015Q2xhc3MjKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5vcmlnaW5hbCwgJ015Q2xhc3MjKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnTXlDbGFzcycpO1xuXHRcdFtzY29yZSwgbWF0Y2hlc10gPSBfZG9TY29yZTIoJ015Q2xhc3MnLCAnTXlDbGFzcyMqJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzY29yZSA9PT0gJ251bWJlcicgJiYgc2NvcmUgPiAwLCAnU2hvdWxkIG1hdGNoIFwiTXlDbGFzc1wiIHN5bWJvbCB3aGVuIHF1ZXJ5IGlzIFwiTXlDbGFzcyMqXCInKTtcblx0XHRhc3NlcnQub2sobWF0Y2hlcy5sZW5ndGggPiAwKTtcblxuXHRcdC8vIFRlc3QgZnV6enkgbWF0Y2hpbmcgc3RpbGwgd29ya3M6IFVzZXIgdHlwZXMgXCJNQyNcIiwgc2hvdWxkIG1hdGNoIFwiTXlDbGFzc1wiXG5cdFx0cXVlcnkgPSBwcmVwYXJlUXVlcnkoJ01DIycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5vcmlnaW5hbCwgJ01DIycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5ub3JtYWxpemVkLCAnTUMnKTtcblx0XHRbc2NvcmUsIG1hdGNoZXNdID0gX2RvU2NvcmUyKCdNeUNsYXNzJywgJ01DIycpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygc2NvcmUgPT09ICdudW1iZXInICYmIHNjb3JlID4gMCwgJ1Nob3VsZCBmdXp6eSBtYXRjaCBcIk15Q2xhc3NcIiBzeW1ib2wgd2hlbiBxdWVyeSBpcyBcIk1DI1wiJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoZXMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBNYWtlIHN1cmUgbGVhZGluZyAjIG9yICMgaW4gdGhlIG1pZGRsZSBhcmUgbm90IHJlbW92ZWQuXG5cdFx0cXVlcnkgPSBwcmVwYXJlUXVlcnkoJyNTcGVjaWFsRnVuY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkub3JpZ2luYWwsICcjU3BlY2lhbEZ1bmN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWQsICcjU3BlY2lhbEZ1bmN0aW9uJyk7XG5cdFx0W3Njb3JlLCBtYXRjaGVzXSA9IF9kb1Njb3JlMignI1NwZWNpYWxGdW5jdGlvbicsICcjU3BlY2lhbEZ1bmN0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzY29yZSA9PT0gJ251bWJlcicgJiYgc2NvcmUgPiAwLCAnU2hvdWxkIG1hdGNoIFwiI1NwZWNpYWxGdW5jdGlvblwiIHN5bWJvbCB3aGVuIHF1ZXJ5IGlzIFwiI1NwZWNpYWxGdW5jdGlvblwiJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoZXMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBNYWtlIHN1cmUgc3RhbmRhbG9uZSAjIGlzIG5vdCByZW1vdmVkXG5cdFx0cXVlcnkgPSBwcmVwYXJlUXVlcnkoJyMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkub3JpZ2luYWwsICcjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5Lm5vcm1hbGl6ZWQsICcjJywgJ1N0YW5kYWxvbmUgIyBzaG91bGQgbm90IGJlIHJlbW92ZWQnKTtcblx0XHRbc2NvcmUsIG1hdGNoZXNdID0gX2RvU2NvcmUyKCcjJywgJyMnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHNjb3JlID09PSAnbnVtYmVyJyAmJiBzY29yZSA+IDAsICdTaG91bGQgbWF0Y2ggXCIjXCIgc3ltYm9sIHdoZW4gcXVlcnkgaXMgXCIjXCInKTtcblx0XHRhc3NlcnQub2sobWF0Y2hlcy5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDBCQUFnRyxjQUFjLGNBQWMsWUFBWSxhQUFhLHNCQUFzQjtBQUNwTCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLFNBQVMsT0FBTyxLQUFLLGFBQWE7QUFDckQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sc0JBQW9EO0FBQUEsRUFFekQsYUFBYSxVQUF1QjtBQUNuQyxXQUFPLFNBQVMsU0FBUyxNQUFNO0FBQUEsRUFDaEM7QUFBQSxFQUVBLG1CQUFtQixVQUF1QjtBQUN6QyxXQUFPLFFBQVEsU0FBUyxNQUFNO0FBQUEsRUFDL0I7QUFBQSxFQUVBLFlBQVksVUFBdUI7QUFDbEMs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
