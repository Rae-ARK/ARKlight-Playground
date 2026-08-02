import { parse } from "../../../../base/common/console.js";
function logRemoteEntry(logService, entry, label = null) {
  const args = parse(entry).args;
  let firstArg = args.shift();
  if (typeof firstArg !== "string") {
    return;
  }
  if (!entry.severity) {
    entry.severity = "info";
  }
  if (label) {
    if (!/^\[/.test(label)) {
      label = `[${label}]`;
    }
    if (!/ $/.test(label)) {
      label = `${label} `;
    }
    firstArg = label + firstArg;
  }
  switch (entry.severity) {
    case "log":
    case "info":
      logService.info(firstArg, ...args);
      break;
    case "warn":
      logService.warn(firstArg, ...args);
      break;
    case "error":
      logService.error(firstArg, ...args);
      break;
  }
}
function logRemoteEntryIfError(logService, entry, label) {
  const args = parse(entry).args;
  const firstArg = args.shift();
  if (typeof firstArg !== "string" || entry.severity !== "error") {
    return;
  }
  if (!/^\[/.test(label)) {
    label = `[${label}]`;
  }
  if (!/ $/.test(label)) {
    label = `${label} `;
  }
  logService.error(label + firstArg, ...args);
}
export {
  logRemoteEntry,
  logRemoteEntryIfError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9yZW1vdGVDb25zb2xlVXRpbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElSZW1vdGVDb25zb2xlTG9nLCBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbnNvbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2dSZW1vdGVFbnRyeShsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgZW50cnk6IElSZW1vdGVDb25zb2xlTG9nLCBsYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGwpOiB2b2lkIHtcblx0Y29uc3QgYXJncyA9IHBhcnNlKGVudHJ5KS5hcmdzO1xuXHRsZXQgZmlyc3RBcmcgPSBhcmdzLnNoaWZ0KCk7XG5cdGlmICh0eXBlb2YgZmlyc3RBcmcgIT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCFlbnRyeS5zZXZlcml0eSkge1xuXHRcdGVudHJ5LnNldmVyaXR5ID0gJ2luZm8nO1xuXHR9XG5cblx0aWYgKGxhYmVsKSB7XG5cdFx0aWYgKCEvXlxcWy8udGVzdChsYWJlbCkpIHtcblx0XHRcdGxhYmVsID0gYFske2xhYmVsfV1gO1xuXHRcdH1cblx0XHRpZiAoIS8gJC8udGVzdChsYWJlbCkpIHtcblx0XHRcdGxhYmVsID0gYCR7bGFiZWx9IGA7XG5cdFx0fVxuXHRcdGZpcnN0QXJnID0gbGFiZWwgKyBmaXJzdEFyZztcblx0fVxuXG5cdHN3aXRjaCAoZW50cnkuc2V2ZXJpdHkpIHtcblx0XHRjYXNlICdsb2cnOlxuXHRcdGNhc2UgJ2luZm8nOlxuXHRcdFx0bG9nU2VydmljZS5pbmZvKGZpcnN0QXJnLCAuLi5hcmdzKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0bG9nU2VydmljZS53YXJuKGZpcnN0QXJnLCAuLi5hcmdzKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZmlyc3RBcmcsIC4uLmFyZ3MpO1xuXHRcdFx0YnJlYWs7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ1JlbW90ZUVudHJ5SWZFcnJvcihsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgZW50cnk6IElSZW1vdGVDb25zb2xlTG9nLCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGFyZ3MgPSBwYXJzZShlbnRyeSkuYXJncztcblx0Y29uc3QgZmlyc3RBcmcgPSBhcmdzLnNoaWZ0KCk7XG5cdGlmICh0eXBlb2YgZmlyc3RBcmcgIT09ICdzdHJpbmcnIHx8IGVudHJ5LnNldmVyaXR5ICE9PSAnZXJyb3InKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCEvXlxcWy8udGVzdChsYWJlbCkpIHtcblx0XHRsYWJlbCA9IGBbJHtsYWJlbH1dYDtcblx0fVxuXHRpZiAoIS8gJC8udGVzdChsYWJlbCkpIHtcblx0XHRsYWJlbCA9IGAke2xhYmVsfSBgO1xuXHR9XG5cblx0bG9nU2VydmljZS5lcnJvcihsYWJlbCArIGZpcnN0QXJnLCAuLi5hcmdzKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQTRCLGFBQWE7QUFHbEMsU0FBUyxlQUFlLFlBQXlCLE9BQTBCLFFBQXVCLE1BQVk7QUFDcEgsUUFBTSxPQUFPLE1BQU0sS0FBSyxFQUFFO0FBQzFCLE1BQUksV0FBVyxLQUFLLE1BQU07QUFDMUIsTUFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQztBQUFBLEVBQ0Q7QUFFQSxNQUFJLENBQUMsTUFBTSxVQUFVO0FBQ3BCLFVBQU0sV0FBVztBQUFBLEVBQ2xCO0FBRUEsTUFBSSxPQUFPO0FBQ1YsUUFBSSxDQUFDLE1BQU0sS0FBSyxLQUFLLEdBQUc7QUFDdkIsY0FBUSxJQUFJLEtBQUs7QUFBQSxJQUNsQjtBQUNBLFFBQUksQ0FBQyxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQ3RCLGNBQVEsR0FBRyxLQUFLO0FBQUEsSUFDakI7QUFDQSxlQUFXLFFBQVE7QUFBQSxFQUNwQjtBQUVBLFVBQVEsTUFBTSxVQUFVO0FBQUEsSUFDdkIsS0FBSztBQUFBLElBQ0wsS0FBSztBQUNKLGlCQUFXLEtBQUssVUFBVSxHQUFHLElBQUk7QUFDakM7QUFBQSxJQUNELEtBQUs7QUFDSixpQkFBVyxLQUFLLFVBQVUsR0FBRyxJQUFJO0FBQ2pDO0FBQUEsSUFDRCxLQUFLO0FBQ0osaUJBQVcsTUFBTSxVQUFVLEdBQUcsSUFBSTtBQUNsQztBQUFBLEVBQ0Y7QUFDRDtBQUVPLFNBQVMsc0JBQXNCLFlBQXlCLE9BQTBCLE9BQXFCO0FBQzdHLFFBQU0sT0FBTyxNQUFNLEtBQUssRUFBRTtBQUMxQixRQUFNLFdBQVcsS0FBSyxNQUFNO0FBQzVCLE1BQUksT0FBTyxhQUFhLFlBQVksTUFBTSxhQUFhLFNBQVM7QUFDL0Q7QUFBQSxFQUNEO0FBRUEsTUFBSSxDQUFDLE1BQU0sS0FBSyxLQUFLLEdBQUc7QUFDdkIsWUFBUSxJQUFJLEtBQUs7QUFBQSxFQUNsQjtBQUNBLE1BQUksQ0FBQyxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQ3RCLFlBQVEsR0FBRyxLQUFLO0FBQUEsRUFDakI7QUFFQSxhQUFXLE1BQU0sUUFBUSxVQUFVLEdBQUcsSUFBSTtBQUMzQzsiLAogICJuYW1lcyI6IFtdCn0K
