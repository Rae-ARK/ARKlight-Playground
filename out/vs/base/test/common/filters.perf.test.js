import { importAMDNodeModule } from "../../../amdX.js";
import * as filters from "../../common/filters.js";
import { FileAccess } from "../../common/network.js";
const patterns = ["cci", "ida", "pos", "CCI", "enbled", "callback", "gGame", "cons", "zyx", "aBc"];
const _enablePerf = false;
function perfSuite(name, callback) {
  if (_enablePerf) {
    suite(name, callback);
  }
}
perfSuite("Performance - fuzzyMatch", async function() {
  const uri = FileAccess.asBrowserUri("vs/base/test/common/filters.perf.data").toString(true);
  const { data } = await importAMDNodeModule(uri, "");
  console.log(`Matching ${data.length} items against ${patterns.length} patterns (${data.length * patterns.length} operations) `);
  function perfTest(name, match) {
    test(name, () => {
      const t1 = Date.now();
      let count = 0;
      for (let i = 0; i < 2; i++) {
        for (const pattern of patterns) {
          const patternLow = pattern.toLowerCase();
          for (const item of data) {
            count += 1;
            match(pattern, patternLow, 0, item, item.toLowerCase(), 0);
          }
        }
      }
      const d = Date.now() - t1;
      console.log(name, `${d}ms, ${Math.round(count / d) * 15}/15ms, ${Math.round(count / d)}/1ms`);
    });
  }
  perfTest("fuzzyScore", filters.fuzzyScore);
  perfTest("fuzzyScoreGraceful", filters.fuzzyScoreGraceful);
  perfTest("fuzzyScoreGracefulAggressive", filters.fuzzyScoreGracefulAggressive);
});
perfSuite("Performance - IFilter", async function() {
  const uri = FileAccess.asBrowserUri("vs/base/test/common/filters.perf.data").toString(true);
  const { data } = await importAMDNodeModule(uri, "");
  function perfTest(name, match) {
    test(name, () => {
      const t1 = Date.now();
      let count = 0;
      for (let i = 0; i < 2; i++) {
        for (const pattern of patterns) {
          for (const item of data) {
            count += 1;
            match(pattern, item);
          }
        }
      }
      const d = Date.now() - t1;
      console.log(name, `${d}ms, ${Math.round(count / d) * 15}/15ms, ${Math.round(count / d)}/1ms`);
    });
  }
  perfTest("matchesFuzzy", filters.matchesFuzzy);
  perfTest("matchesFuzzy2", filters.matchesFuzzy2);
  perfTest("matchesPrefix", filters.matchesPrefix);
  perfTest("matchesContiguousSubString", filters.matchesContiguousSubString);
  perfTest("matchesCamelCase", filters.matchesCamelCase);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZmlsdGVycy5wZXJmLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0ICogYXMgZmlsdGVycyBmcm9tICcuLi8uLi9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vY29tbW9uL25ldHdvcmsuanMnO1xuXG5jb25zdCBwYXR0ZXJucyA9IFsnY2NpJywgJ2lkYScsICdwb3MnLCAnQ0NJJywgJ2VuYmxlZCcsICdjYWxsYmFjaycsICdnR2FtZScsICdjb25zJywgJ3p5eCcsICdhQmMnXTtcblxuY29uc3QgX2VuYWJsZVBlcmYgPSBmYWxzZTtcblxuZnVuY3Rpb24gcGVyZlN1aXRlKG5hbWU6IHN0cmluZywgY2FsbGJhY2s6ICh0aGlzOiBNb2NoYS5TdWl0ZSkgPT4gdm9pZCkge1xuXHRpZiAoX2VuYWJsZVBlcmYpIHtcblx0XHRzdWl0ZShuYW1lLCBjYWxsYmFjayk7XG5cdH1cbn1cblxucGVyZlN1aXRlKCdQZXJmb3JtYW5jZSAtIGZ1enp5TWF0Y2gnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgdXJpID0gRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL2Jhc2UvdGVzdC9jb21tb24vZmlsdGVycy5wZXJmLmRhdGEnKS50b1N0cmluZyh0cnVlKTtcblx0Y29uc3QgeyBkYXRhIH0gPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJy4vZmlsdGVycy5wZXJmLmRhdGEuanMnKT4odXJpLCAnJyk7XG5cblx0Ly8gc3VpdGVTZXR1cCgoKSA9PiBjb25zb2xlLnByb2ZpbGUoKSk7XG5cdC8vIHN1aXRlVGVhcmRvd24oKCkgPT4gY29uc29sZS5wcm9maWxlRW5kKCkpO1xuXG5cdGNvbnNvbGUubG9nKGBNYXRjaGluZyAke2RhdGEubGVuZ3RofSBpdGVtcyBhZ2FpbnN0ICR7cGF0dGVybnMubGVuZ3RofSBwYXR0ZXJucyAoJHtkYXRhLmxlbmd0aCAqIHBhdHRlcm5zLmxlbmd0aH0gb3BlcmF0aW9ucykgYCk7XG5cblx0ZnVuY3Rpb24gcGVyZlRlc3QobmFtZTogc3RyaW5nLCBtYXRjaDogZmlsdGVycy5GdXp6eVNjb3Jlcikge1xuXHRcdHRlc3QobmFtZSwgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCB0MSA9IERhdGUubm93KCk7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyOyBpKyspIHtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGF0dGVybkxvdyA9IHBhdHRlcm4udG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuXHRcdFx0XHRcdFx0Y291bnQgKz0gMTtcblx0XHRcdFx0XHRcdG1hdGNoKHBhdHRlcm4sIHBhdHRlcm5Mb3csIDAsIGl0ZW0sIGl0ZW0udG9Mb3dlckNhc2UoKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkID0gRGF0ZS5ub3coKSAtIHQxO1xuXHRcdFx0Y29uc29sZS5sb2cobmFtZSwgYCR7ZH1tcywgJHtNYXRoLnJvdW5kKGNvdW50IC8gZCkgKiAxNX0vMTVtcywgJHtNYXRoLnJvdW5kKGNvdW50IC8gZCl9LzFtc2ApO1xuXHRcdH0pO1xuXHR9XG5cblx0cGVyZlRlc3QoJ2Z1enp5U2NvcmUnLCBmaWx0ZXJzLmZ1enp5U2NvcmUpO1xuXHRwZXJmVGVzdCgnZnV6enlTY29yZUdyYWNlZnVsJywgZmlsdGVycy5mdXp6eVNjb3JlR3JhY2VmdWwpO1xuXHRwZXJmVGVzdCgnZnV6enlTY29yZUdyYWNlZnVsQWdncmVzc2l2ZScsIGZpbHRlcnMuZnV6enlTY29yZUdyYWNlZnVsQWdncmVzc2l2ZSk7XG59KTtcblxuXG5wZXJmU3VpdGUoJ1BlcmZvcm1hbmNlIC0gSUZpbHRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCB1cmkgPSBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaSgndnMvYmFzZS90ZXN0L2NvbW1vbi9maWx0ZXJzLnBlcmYuZGF0YScpLnRvU3RyaW5nKHRydWUpO1xuXHRjb25zdCB7IGRhdGEgfSA9IGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnLi9maWx0ZXJzLnBlcmYuZGF0YS5qcycpPih1cmksICcnKTtcblxuXHRmdW5jdGlvbiBwZXJmVGVzdChuYW1lOiBzdHJpbmcsIG1hdGNoOiBmaWx0ZXJzLklGaWx0ZXIpIHtcblx0XHR0ZXN0KG5hbWUsICgpID0+IHtcblxuXHRcdFx0Y29uc3QgdDEgPSBEYXRlLm5vdygpO1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjsgaSsrKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XG5cdFx0XHRcdFx0XHRjb3VudCArPSAxO1xuXHRcdFx0XHRcdFx0bWF0Y2gocGF0dGVybiwgaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkID0gRGF0ZS5ub3coKSAtIHQxO1xuXHRcdFx0Y29uc29sZS5sb2cobmFtZSwgYCR7ZH1tcywgJHtNYXRoLnJvdW5kKGNvdW50IC8gZCkgKiAxNX0vMTVtcywgJHtNYXRoLnJvdW5kKGNvdW50IC8gZCl9LzFtc2ApO1xuXHRcdH0pO1xuXHR9XG5cblx0cGVyZlRlc3QoJ21hdGNoZXNGdXp6eScsIGZpbHRlcnMubWF0Y2hlc0Z1enp5KTtcblx0cGVyZlRlc3QoJ21hdGNoZXNGdXp6eTInLCBmaWx0ZXJzLm1hdGNoZXNGdXp6eTIpO1xuXHRwZXJmVGVzdCgnbWF0Y2hlc1ByZWZpeCcsIGZpbHRlcnMubWF0Y2hlc1ByZWZpeCk7XG5cdHBlcmZUZXN0KCdtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZycsIGZpbHRlcnMubWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcpO1xuXHRwZXJmVGVzdCgnbWF0Y2hlc0NhbWVsQ2FzZScsIGZpbHRlcnMubWF0Y2hlc0NhbWVsQ2FzZSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsMkJBQTJCO0FBQ3BDLFlBQVksYUFBYTtBQUN6QixTQUFTLGtCQUFrQjtBQUUzQixNQUFNLFdBQVcsQ0FBQyxPQUFPLE9BQU8sT0FBTyxPQUFPLFVBQVUsWUFBWSxTQUFTLFFBQVEsT0FBTyxLQUFLO0FBRWpHLE1BQU0sY0FBYztBQUVwQixTQUFTLFVBQVUsTUFBYyxVQUF1QztBQUN2RSxNQUFJLGFBQWE7QUFDaEIsVUFBTSxNQUFNLFFBQVE7QUFBQSxFQUNyQjtBQUNEO0FBRUEsVUFBVSw0QkFBNEIsaUJBQWtCO0FBRXZELFFBQU0sTUFBTSxXQUFXLGFBQWEsdUNBQXVDLEVBQUUsU0FBUyxJQUFJO0FBQzFGLFFBQU0sRUFBRSxLQUFLLElBQUksTUFBTSxvQkFBNkQsS0FBSyxFQUFFO0FBSzNGLFVBQVEsSUFBSSxZQUFZLEtBQUssTUFBTSxrQkFBa0IsU0FBUyxNQUFNLGNBQWMsS0FBSyxTQUFTLFNBQVMsTUFBTSxlQUFlO0FBRTlILFdBQVMsU0FBUyxNQUFjLE9BQTRCO0FBQzNELFNBQUssTUFBTSxNQUFNO0FBRWhCLFlBQU0sS0FBSyxLQUFLLElBQUk7QUFDcEIsVUFBSSxRQUFRO0FBQ1osZUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsbUJBQVcsV0FBVyxVQUFVO0FBQy9CLGdCQUFNLGFBQWEsUUFBUSxZQUFZO0FBQ3ZDLHFCQUFXLFFBQVEsTUFBTTtBQUN4QixxQkFBUztBQUNULGtCQUFNLFNBQVMsWUFBWSxHQUFHLE1BQU0sS0FBSyxZQUFZLEdBQUcsQ0FBQztBQUFBLFVBQzFEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFDdkIsY0FBUSxJQUFJLE1BQU0sR0FBRyxDQUFDLE9BQU8sS0FBSyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxLQUFLLE1BQU0sUUFBUSxDQUFDLENBQUMsTUFBTTtBQUFBLElBQzdGLENBQUM7QUFBQSxFQUNGO0FBRUEsV0FBUyxjQUFjLFFBQVEsVUFBVTtBQUN6QyxXQUFTLHNCQUFzQixRQUFRLGtCQUFrQjtBQUN6RCxXQUFTLGdDQUFnQyxRQUFRLDRCQUE0QjtBQUM5RSxDQUFDO0FBR0QsVUFBVSx5QkFBeUIsaUJBQWtCO0FBRXBELFFBQU0sTUFBTSxXQUFXLGFBQWEsdUNBQXVDLEVBQUUsU0FBUyxJQUFJO0FBQzFGLFFBQU0sRUFBRSxLQUFLLElBQUksTUFBTSxvQkFBNkQsS0FBSyxFQUFFO0FBRTNGLFdBQVMsU0FBUyxNQUFjLE9BQXdCO0FBQ3ZELFNBQUssTUFBTSxNQUFNO0FBRWhCLFlBQU0sS0FBSyxLQUFLLElBQUk7QUFDcEIsVUFBSSxRQUFRO0FBQ1osZUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsbUJBQVcsV0FBVyxVQUFVO0FBQy9CLHFCQUFXLFFBQVEsTUFBTTtBQUN4QixxQkFBUztBQUNULGtCQUFNLFNBQVMsSUFBSTtBQUFBLFVBQ3BCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFDdkIsY0FBUSxJQUFJLE1BQU0sR0FBRyxDQUFDLE9BQU8sS0FBSyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxLQUFLLE1BQU0sUUFBUSxDQUFDLENBQUMsTUFBTTtBQUFBLElBQzdGLENBQUM7QUFBQSxFQUNGO0FBRUEsV0FBUyxnQkFBZ0IsUUFBUSxZQUFZO0FBQzdDLFdBQVMsaUJBQWlCLFFBQVEsYUFBYTtBQUMvQyxXQUFTLGlCQUFpQixRQUFRLGFBQWE7QUFDL0MsV0FBUyw4QkFBOEIsUUFBUSwwQkFBMEI7QUFDekUsV0FBUyxvQkFBb0IsUUFBUSxnQkFBZ0I7QUFDdEQsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
