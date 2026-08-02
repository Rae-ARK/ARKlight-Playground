import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
class KeybindingIO {
  static writeKeybindingItem(out, item) {
    if (!item.resolvedKeybinding) {
      return;
    }
    const quotedSerializedKeybinding = JSON.stringify(item.resolvedKeybinding.getUserSettingsLabel());
    out.write(`{ "key": ${rightPaddedString(quotedSerializedKeybinding + ",", 25)} "command": `);
    const quotedSerializedWhen = item.when ? JSON.stringify(item.when.serialize()) : "";
    const quotedSerializeCommand = JSON.stringify(item.command);
    if (quotedSerializedWhen.length > 0) {
      out.write(`${quotedSerializeCommand},`);
      out.writeLine();
      out.write(`                                     "when": ${quotedSerializedWhen}`);
    } else {
      out.write(`${quotedSerializeCommand}`);
    }
    if (item.commandArgs) {
      out.write(",");
      out.writeLine();
      out.write(`                                     "args": ${JSON.stringify(item.commandArgs)}`);
    }
    if (item.systemWide) {
      out.write(",");
      out.writeLine();
      out.write(`                                     "systemWide": true`);
    }
    out.write(" }");
  }
  static readUserKeybindingItem(input) {
    const keybinding = "key" in input && typeof input.key === "string" ? KeybindingParser.parseKeybinding(input.key) : null;
    const when = "when" in input && typeof input.when === "string" ? ContextKeyExpr.deserialize(input.when) : void 0;
    const command = "command" in input && typeof input.command === "string" ? input.command : null;
    const commandArgs = "args" in input && typeof input.args !== "undefined" ? input.args : void 0;
    const systemWide = "systemWide" in input && typeof input.systemWide === "boolean" ? input.systemWide : false;
    return {
      keybinding,
      command,
      commandArgs,
      when,
      systemWide,
      _sourceKey: "key" in input && typeof input.key === "string" ? input.key : void 0
    };
  }
}
function rightPaddedString(str, minChars) {
  if (str.length < minChars) {
    return str + new Array(minChars - str.length).join(" ");
  }
  return str;
}
class OutputBuilder {
  constructor() {
    this._lines = [];
    this._currentLine = "";
  }
  write(str) {
    this._currentLine += str;
  }
  writeLine(str = "") {
    this._lines.push(this._currentLine + str);
    this._currentLine = "";
  }
  toString() {
    this.writeLine();
    return this._lines.join("\n");
  }
}
export {
  KeybindingIO,
  OutputBuilder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nSU8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXliaW5kaW5nUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ1BhcnNlci5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVzZXJLZXliaW5kaW5nSXRlbSB7XG5cdGtleWJpbmRpbmc6IEtleWJpbmRpbmcgfCBudWxsO1xuXHRjb21tYW5kOiBzdHJpbmcgfCBudWxsO1xuXHRjb21tYW5kQXJncz86IHVua25vd247XG5cdHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRzeXN0ZW1XaWRlOiBib29sZWFuO1xuXHRfc291cmNlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7IC8qKiBjYXB0dXJlcyBga2V5YCBmaWVsZCBmcm9tIGBrZXliaW5kaW5ncy5qc29uYDsgYHRoaXMua2V5YmluZGluZyAhPT0gbnVsbGAgaW1wbGllcyBgX3NvdXJjZUtleSAhPT0gbnVsbGAgKi9cbn1cblxuZXhwb3J0IGNsYXNzIEtleWJpbmRpbmdJTyB7XG5cblx0cHVibGljIHN0YXRpYyB3cml0ZUtleWJpbmRpbmdJdGVtKG91dDogT3V0cHV0QnVpbGRlciwgaXRlbTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSk6IHZvaWQge1xuXHRcdGlmICghaXRlbS5yZXNvbHZlZEtleWJpbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcXVvdGVkU2VyaWFsaXplZEtleWJpbmRpbmcgPSBKU09OLnN0cmluZ2lmeShpdGVtLnJlc29sdmVkS2V5YmluZGluZy5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpKTtcblx0XHRvdXQud3JpdGUoYHsgXCJrZXlcIjogJHtyaWdodFBhZGRlZFN0cmluZyhxdW90ZWRTZXJpYWxpemVkS2V5YmluZGluZyArICcsJywgMjUpfSBcImNvbW1hbmRcIjogYCk7XG5cblx0XHRjb25zdCBxdW90ZWRTZXJpYWxpemVkV2hlbiA9IGl0ZW0ud2hlbiA/IEpTT04uc3RyaW5naWZ5KGl0ZW0ud2hlbi5zZXJpYWxpemUoKSkgOiAnJztcblx0XHRjb25zdCBxdW90ZWRTZXJpYWxpemVDb21tYW5kID0gSlNPTi5zdHJpbmdpZnkoaXRlbS5jb21tYW5kKTtcblx0XHRpZiAocXVvdGVkU2VyaWFsaXplZFdoZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0b3V0LndyaXRlKGAke3F1b3RlZFNlcmlhbGl6ZUNvbW1hbmR9LGApO1xuXHRcdFx0b3V0LndyaXRlTGluZSgpO1xuXHRcdFx0b3V0LndyaXRlKGAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ3aGVuXCI6ICR7cXVvdGVkU2VyaWFsaXplZFdoZW59YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG91dC53cml0ZShgJHtxdW90ZWRTZXJpYWxpemVDb21tYW5kfWApO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5jb21tYW5kQXJncykge1xuXHRcdFx0b3V0LndyaXRlKCcsJyk7XG5cdFx0XHRvdXQud3JpdGVMaW5lKCk7XG5cdFx0XHRvdXQud3JpdGUoYCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFyZ3NcIjogJHtKU09OLnN0cmluZ2lmeShpdGVtLmNvbW1hbmRBcmdzKX1gKTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0uc3lzdGVtV2lkZSkge1xuXHRcdFx0b3V0LndyaXRlKCcsJyk7XG5cdFx0XHRvdXQud3JpdGVMaW5lKCk7XG5cdFx0XHRvdXQud3JpdGUoYCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInN5c3RlbVdpZGVcIjogdHJ1ZWApO1xuXHRcdH1cblx0XHRvdXQud3JpdGUoJyB9Jyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlYWRVc2VyS2V5YmluZGluZ0l0ZW0oaW5wdXQ6IE9iamVjdCk6IElVc2VyS2V5YmluZGluZ0l0ZW0ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSAna2V5JyBpbiBpbnB1dCAmJiB0eXBlb2YgaW5wdXQua2V5ID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBLZXliaW5kaW5nUGFyc2VyLnBhcnNlS2V5YmluZGluZyhpbnB1dC5rZXkpXG5cdFx0XHQ6IG51bGw7XG5cdFx0Y29uc3Qgd2hlbiA9ICd3aGVuJyBpbiBpbnB1dCAmJiB0eXBlb2YgaW5wdXQud2hlbiA9PT0gJ3N0cmluZydcblx0XHRcdD8gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoaW5wdXQud2hlbilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSAnY29tbWFuZCcgaW4gaW5wdXQgJiYgdHlwZW9mIGlucHV0LmNvbW1hbmQgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IGlucHV0LmNvbW1hbmRcblx0XHRcdDogbnVsbDtcblx0XHRjb25zdCBjb21tYW5kQXJncyA9ICdhcmdzJyBpbiBpbnB1dCAmJiB0eXBlb2YgaW5wdXQuYXJncyAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdD8gaW5wdXQuYXJnc1xuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3lzdGVtV2lkZSA9ICdzeXN0ZW1XaWRlJyBpbiBpbnB1dCAmJiB0eXBlb2YgaW5wdXQuc3lzdGVtV2lkZSA9PT0gJ2Jvb2xlYW4nXG5cdFx0XHQ/IGlucHV0LnN5c3RlbVdpZGVcblx0XHRcdDogZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtleWJpbmRpbmcsXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0Y29tbWFuZEFyZ3MsXG5cdFx0XHR3aGVuLFxuXHRcdFx0c3lzdGVtV2lkZSxcblx0XHRcdF9zb3VyY2VLZXk6ICdrZXknIGluIGlucHV0ICYmIHR5cGVvZiBpbnB1dC5rZXkgPT09ICdzdHJpbmcnID8gaW5wdXQua2V5IDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gcmlnaHRQYWRkZWRTdHJpbmcoc3RyOiBzdHJpbmcsIG1pbkNoYXJzOiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAoc3RyLmxlbmd0aCA8IG1pbkNoYXJzKSB7XG5cdFx0cmV0dXJuIHN0ciArIChuZXcgQXJyYXkobWluQ2hhcnMgLSBzdHIubGVuZ3RoKS5qb2luKCcgJykpO1xuXHR9XG5cdHJldHVybiBzdHI7XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRwdXRCdWlsZGVyIHtcblxuXHRwcml2YXRlIF9saW5lczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfY3VycmVudExpbmU6IHN0cmluZyA9ICcnO1xuXG5cdHdyaXRlKHN0cjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudExpbmUgKz0gc3RyO1xuXHR9XG5cblx0d3JpdGVMaW5lKHN0cjogc3RyaW5nID0gJycpOiB2b2lkIHtcblx0XHR0aGlzLl9saW5lcy5wdXNoKHRoaXMuX2N1cnJlbnRMaW5lICsgc3RyKTtcblx0XHR0aGlzLl9jdXJyZW50TGluZSA9ICcnO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHR0aGlzLndyaXRlTGluZSgpO1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5qb2luKCdcXG4nKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxzQkFBNEM7QUFZOUMsTUFBTSxhQUFhO0FBQUEsRUFFekIsT0FBYyxvQkFBb0IsS0FBb0IsTUFBb0M7QUFDekYsUUFBSSxDQUFDLEtBQUssb0JBQW9CO0FBQzdCO0FBQUEsSUFDRDtBQUNBLFVBQU0sNkJBQTZCLEtBQUssVUFBVSxLQUFLLG1CQUFtQixxQkFBcUIsQ0FBQztBQUNoRyxRQUFJLE1BQU0sWUFBWSxrQkFBa0IsNkJBQTZCLEtBQUssRUFBRSxDQUFDLGNBQWM7QUFFM0YsVUFBTSx1QkFBdUIsS0FBSyxPQUFPLEtBQUssVUFBVSxLQUFLLEtBQUssVUFBVSxDQUFDLElBQUk7QUFDakYsVUFBTSx5QkFBeUIsS0FBSyxVQUFVLEtBQUssT0FBTztBQUMxRCxRQUFJLHFCQUFxQixTQUFTLEdBQUc7QUFDcEMsVUFBSSxNQUFNLEdBQUcsc0JBQXNCLEdBQUc7QUFDdEMsVUFBSSxVQUFVO0FBQ2QsVUFBSSxNQUFNLGdEQUFnRCxvQkFBb0IsRUFBRTtBQUFBLElBQ2pGLE9BQU87QUFDTixVQUFJLE1BQU0sR0FBRyxzQkFBc0IsRUFBRTtBQUFBLElBQ3RDO0FBQ0EsUUFBSSxLQUFLLGFBQWE7QUFDckIsVUFBSSxNQUFNLEdBQUc7QUFDYixVQUFJLFVBQVU7QUFDZCxVQUFJLE1BQU0sZ0RBQWdELEtBQUssVUFBVSxLQUFLLFdBQVcsQ0FBQyxFQUFFO0FBQUEsSUFDN0Y7QUFDQSxRQUFJLEtBQUssWUFBWTtBQUNwQixVQUFJLE1BQU0sR0FBRztBQUNiLFVBQUksVUFBVTtBQUNkLFVBQUksTUFBTSx5REFBeUQ7QUFBQSxJQUNwRTtBQUNBLFFBQUksTUFBTSxJQUFJO0FBQUEsRUFDZjtBQUFBLEVBRUEsT0FBYyx1QkFBdUIsT0FBb0M7QUFDeEUsVUFBTSxhQUFhLFNBQVMsU0FBUyxPQUFPLE1BQU0sUUFBUSxXQUN2RCxpQkFBaUIsZ0JBQWdCLE1BQU0sR0FBRyxJQUMxQztBQUNILFVBQU0sT0FBTyxVQUFVLFNBQVMsT0FBTyxNQUFNLFNBQVMsV0FDbkQsZUFBZSxZQUFZLE1BQU0sSUFBSSxJQUNyQztBQUNILFVBQU0sVUFBVSxhQUFhLFNBQVMsT0FBTyxNQUFNLFlBQVksV0FDNUQsTUFBTSxVQUNOO0FBQ0gsVUFBTSxjQUFjLFVBQVUsU0FBUyxPQUFPLE1BQU0sU0FBUyxjQUMxRCxNQUFNLE9BQ047QUFDSCxVQUFNLGFBQWEsZ0JBQWdCLFNBQVMsT0FBTyxNQUFNLGVBQWUsWUFDckUsTUFBTSxhQUNOO0FBQ0gsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFZLFNBQVMsU0FBUyxPQUFPLE1BQU0sUUFBUSxXQUFXLE1BQU0sTUFBTTtBQUFBLElBQzNFO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxrQkFBa0IsS0FBYSxVQUEwQjtBQUNqRSxNQUFJLElBQUksU0FBUyxVQUFVO0FBQzFCLFdBQU8sTUFBTyxJQUFJLE1BQU0sV0FBVyxJQUFJLE1BQU0sRUFBRSxLQUFLLEdBQUc7QUFBQSxFQUN4RDtBQUNBLFNBQU87QUFDUjtBQUVPLE1BQU0sY0FBYztBQUFBLEVBQXBCO0FBRU4sU0FBUSxTQUFtQixDQUFDO0FBQzVCLFNBQVEsZUFBdUI7QUFBQTtBQUFBLEVBRS9CLE1BQU0sS0FBbUI7QUFDeEIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRUEsVUFBVSxNQUFjLElBQVU7QUFDakMsU0FBSyxPQUFPLEtBQUssS0FBSyxlQUFlLEdBQUc7QUFDeEMsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVBLFdBQW1CO0FBQ2xCLFNBQUssVUFBVTtBQUNmLFdBQU8sS0FBSyxPQUFPLEtBQUssSUFBSTtBQUFBLEVBQzdCO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
