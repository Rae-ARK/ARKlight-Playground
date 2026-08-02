import { CharCode } from "../../../../base/common/charCode.js";
class Array2D {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.array = [];
    this.array = new Array(width * height);
  }
  get(x, y) {
    return this.array[x + y * this.width];
  }
  set(x, y, value) {
    this.array[x + y * this.width] = value;
  }
}
function isSpace(charCode) {
  return charCode === CharCode.Space || charCode === CharCode.Tab;
}
const _LineRangeFragment = class _LineRangeFragment {
  constructor(range, lines, source) {
    this.range = range;
    this.lines = lines;
    this.source = source;
    this.histogram = [];
    let counter = 0;
    for (let i = range.startLineNumber - 1; i < range.endLineNumberExclusive - 1; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        counter++;
        const chr = line[j];
        const key2 = _LineRangeFragment.getKey(chr);
        this.histogram[key2] = (this.histogram[key2] || 0) + 1;
      }
      counter++;
      const key = _LineRangeFragment.getKey("\n");
      this.histogram[key] = (this.histogram[key] || 0) + 1;
    }
    this.totalCount = counter;
  }
  static getKey(chr) {
    let key = this.chrKeys.get(chr);
    if (key === void 0) {
      key = this.chrKeys.size;
      this.chrKeys.set(chr, key);
    }
    return key;
  }
  computeSimilarity(other) {
    let sumDifferences = 0;
    const maxLength = Math.max(this.histogram.length, other.histogram.length);
    for (let i = 0; i < maxLength; i++) {
      sumDifferences += Math.abs((this.histogram[i] ?? 0) - (other.histogram[i] ?? 0));
    }
    return 1 - sumDifferences / (this.totalCount + other.totalCount);
  }
};
_LineRangeFragment.chrKeys = /* @__PURE__ */ new Map();
let LineRangeFragment = _LineRangeFragment;
export {
  Array2D,
  LineRangeFragment,
  isSpace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvdXRpbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi9yYW5nZU1hcHBpbmcuanMnO1xuXG5leHBvcnQgY2xhc3MgQXJyYXkyRDxUPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXJyYXk6IFRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB3aWR0aDogbnVtYmVyLCBwdWJsaWMgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHR0aGlzLmFycmF5ID0gbmV3IEFycmF5PFQ+KHdpZHRoICogaGVpZ2h0KTtcblx0fVxuXG5cdGdldCh4OiBudW1iZXIsIHk6IG51bWJlcik6IFQge1xuXHRcdHJldHVybiB0aGlzLmFycmF5W3ggKyB5ICogdGhpcy53aWR0aF07XG5cdH1cblxuXHRzZXQoeDogbnVtYmVyLCB5OiBudW1iZXIsIHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0dGhpcy5hcnJheVt4ICsgeSAqIHRoaXMud2lkdGhdID0gdmFsdWU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3BhY2UoY2hhckNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2hhckNvZGUgPT09IENoYXJDb2RlLlNwYWNlIHx8IGNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWI7XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5lUmFuZ2VGcmFnbWVudCB7XG5cdHByaXZhdGUgc3RhdGljIGNocktleXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIGdldEtleShjaHI6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0bGV0IGtleSA9IHRoaXMuY2hyS2V5cy5nZXQoY2hyKTtcblx0XHRpZiAoa2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGtleSA9IHRoaXMuY2hyS2V5cy5zaXplO1xuXHRcdFx0dGhpcy5jaHJLZXlzLnNldChjaHIsIGtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBrZXk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHRvdGFsQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBoaXN0b2dyYW06IG51bWJlcltdID0gW107XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByYW5nZTogTGluZVJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lczogc3RyaW5nW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNvdXJjZTogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLFxuXHQpIHtcblx0XHRsZXQgY291bnRlciA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDE7IGkgPCByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMTsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IGxpbmUubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0Y291bnRlcisrO1xuXHRcdFx0XHRjb25zdCBjaHIgPSBsaW5lW2pdO1xuXHRcdFx0XHRjb25zdCBrZXkgPSBMaW5lUmFuZ2VGcmFnbWVudC5nZXRLZXkoY2hyKTtcblx0XHRcdFx0dGhpcy5oaXN0b2dyYW1ba2V5XSA9ICh0aGlzLmhpc3RvZ3JhbVtrZXldIHx8IDApICsgMTtcblx0XHRcdH1cblx0XHRcdGNvdW50ZXIrKztcblx0XHRcdGNvbnN0IGtleSA9IExpbmVSYW5nZUZyYWdtZW50LmdldEtleSgnXFxuJyk7XG5cdFx0XHR0aGlzLmhpc3RvZ3JhbVtrZXldID0gKHRoaXMuaGlzdG9ncmFtW2tleV0gfHwgMCkgKyAxO1xuXHRcdH1cblxuXHRcdHRoaXMudG90YWxDb3VudCA9IGNvdW50ZXI7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZVNpbWlsYXJpdHkob3RoZXI6IExpbmVSYW5nZUZyYWdtZW50KTogbnVtYmVyIHtcblx0XHRsZXQgc3VtRGlmZmVyZW5jZXMgPSAwO1xuXHRcdGNvbnN0IG1heExlbmd0aCA9IE1hdGgubWF4KHRoaXMuaGlzdG9ncmFtLmxlbmd0aCwgb3RoZXIuaGlzdG9ncmFtLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXhMZW5ndGg7IGkrKykge1xuXHRcdFx0c3VtRGlmZmVyZW5jZXMgKz0gTWF0aC5hYnMoKHRoaXMuaGlzdG9ncmFtW2ldID8/IDApIC0gKG90aGVyLmhpc3RvZ3JhbVtpXSA/PyAwKSk7XG5cdFx0fVxuXHRcdHJldHVybiAxIC0gKHN1bURpZmZlcmVuY2VzIC8gKHRoaXMudG90YWxDb3VudCArIG90aGVyLnRvdGFsQ291bnQpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFJbEIsTUFBTSxRQUFXO0FBQUEsRUFHdkIsWUFBNEIsT0FBK0IsUUFBZ0I7QUFBL0M7QUFBK0I7QUFGM0QsU0FBaUIsUUFBYSxDQUFDO0FBRzlCLFNBQUssUUFBUSxJQUFJLE1BQVMsUUFBUSxNQUFNO0FBQUEsRUFDekM7QUFBQSxFQUVBLElBQUksR0FBVyxHQUFjO0FBQzVCLFdBQU8sS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEtBQUs7QUFBQSxFQUNyQztBQUFBLEVBRUEsSUFBSSxHQUFXLEdBQVcsT0FBZ0I7QUFDekMsU0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEtBQUssSUFBSTtBQUFBLEVBQ2xDO0FBQ0Q7QUFFTyxTQUFTLFFBQVEsVUFBMkI7QUFDbEQsU0FBTyxhQUFhLFNBQVMsU0FBUyxhQUFhLFNBQVM7QUFDN0Q7QUFFTyxNQUFNLHFCQUFOLE1BQU0sbUJBQWtCO0FBQUEsRUFjOUIsWUFDaUIsT0FDQSxPQUNBLFFBQ2Y7QUFIZTtBQUNBO0FBQ0E7QUFKakIsU0FBaUIsWUFBc0IsQ0FBQztBQU12QyxRQUFJLFVBQVU7QUFDZCxhQUFTLElBQUksTUFBTSxrQkFBa0IsR0FBRyxJQUFJLE1BQU0seUJBQXlCLEdBQUcsS0FBSztBQUNsRixZQUFNLE9BQU8sTUFBTSxDQUFDO0FBQ3BCLGVBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLEtBQUs7QUFDckM7QUFDQSxjQUFNLE1BQU0sS0FBSyxDQUFDO0FBQ2xCLGNBQU1BLE9BQU0sbUJBQWtCLE9BQU8sR0FBRztBQUN4QyxhQUFLLFVBQVVBLElBQUcsS0FBSyxLQUFLLFVBQVVBLElBQUcsS0FBSyxLQUFLO0FBQUEsTUFDcEQ7QUFDQTtBQUNBLFlBQU0sTUFBTSxtQkFBa0IsT0FBTyxJQUFJO0FBQ3pDLFdBQUssVUFBVSxHQUFHLEtBQUssS0FBSyxVQUFVLEdBQUcsS0FBSyxLQUFLO0FBQUEsSUFDcEQ7QUFFQSxTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBL0JBLE9BQWUsT0FBTyxLQUFxQjtBQUMxQyxRQUFJLE1BQU0sS0FBSyxRQUFRLElBQUksR0FBRztBQUM5QixRQUFJLFFBQVEsUUFBVztBQUN0QixZQUFNLEtBQUssUUFBUTtBQUNuQixXQUFLLFFBQVEsSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUMxQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUEwQk8sa0JBQWtCLE9BQWtDO0FBQzFELFFBQUksaUJBQWlCO0FBQ3JCLFVBQU0sWUFBWSxLQUFLLElBQUksS0FBSyxVQUFVLFFBQVEsTUFBTSxVQUFVLE1BQU07QUFDeEUsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLEtBQUs7QUFDbkMsd0JBQWtCLEtBQUssS0FBSyxLQUFLLFVBQVUsQ0FBQyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUMsS0FBSyxFQUFFO0FBQUEsSUFDaEY7QUFDQSxXQUFPLElBQUssa0JBQWtCLEtBQUssYUFBYSxNQUFNO0FBQUEsRUFDdkQ7QUFDRDtBQTVDYSxtQkFDRyxVQUFVLG9CQUFJLElBQW9CO0FBRDNDLElBQU0sb0JBQU47IiwKICAibmFtZXMiOiBbImtleSJdCn0K
