import { isObject, isString } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
function localizeManifest(logger, extensionManifest, translations, fallbackTranslations) {
  try {
    replaceNLStrings(logger, extensionManifest, translations, fallbackTranslations);
  } catch (error) {
    logger.error(error?.message ?? error);
  }
  return extensionManifest;
}
function replaceNLStrings(logger, extensionManifest, messages, originalMessages) {
  const processEntry = (obj, key, command) => {
    const value = obj[key];
    if (isString(value)) {
      const str = value;
      const length = str.length;
      if (length > 1 && str[0] === "%" && str[length - 1] === "%") {
        const messageKey = str.substr(1, length - 2);
        let translated = messages[messageKey];
        if (translated === void 0 && originalMessages) {
          translated = originalMessages[messageKey];
        }
        const message = typeof translated === "string" ? translated : translated?.message;
        const original = originalMessages?.[messageKey];
        const originalMessage = typeof original === "string" ? original : original?.message;
        if (!message) {
          if (!originalMessage) {
            logger.warn(`[${extensionManifest.name}]: ${localize("missingNLSKey", "Couldn't find message for key {0}.", messageKey)}`);
          }
          return;
        }
        if (
          // if we are translating the title or category of a command
          command && (key === "title" || key === "category") && // and the original value is not the same as the translated value
          originalMessage && originalMessage !== message
        ) {
          const localizedString = {
            value: message,
            original: originalMessage
          };
          obj[key] = localizedString;
        } else {
          obj[key] = message;
        }
      }
    } else if (isObject(value)) {
      for (const k in value) {
        if (value.hasOwnProperty(k)) {
          k === "commands" ? processEntry(value, k, true) : processEntry(value, k, command);
        }
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        processEntry(value, i, command);
      }
    }
  };
  for (const key in extensionManifest) {
    if (extensionManifest.hasOwnProperty(key)) {
      processEntry(extensionManifest, key);
    }
  }
}
export {
  localizeManifest
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk5scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dnZXIgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRyYW5zbGF0aW9ucyB7XG5cdFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHsgbWVzc2FnZTogc3RyaW5nOyBjb21tZW50OiBzdHJpbmdbXSB9IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9jYWxpemVNYW5pZmVzdChsb2dnZXI6IElMb2dnZXIsIGV4dGVuc2lvbk1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIHRyYW5zbGF0aW9uczogSVRyYW5zbGF0aW9ucywgZmFsbGJhY2tUcmFuc2xhdGlvbnM/OiBJVHJhbnNsYXRpb25zKTogSUV4dGVuc2lvbk1hbmlmZXN0IHtcblx0dHJ5IHtcblx0XHRyZXBsYWNlTkxTdHJpbmdzKGxvZ2dlciwgZXh0ZW5zaW9uTWFuaWZlc3QsIHRyYW5zbGF0aW9ucywgZmFsbGJhY2tUcmFuc2xhdGlvbnMpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGxvZ2dlci5lcnJvcihlcnJvcj8ubWVzc2FnZSA/PyBlcnJvcik7XG5cdFx0LypJZ25vcmUgRXJyb3IqL1xuXHR9XG5cdHJldHVybiBleHRlbnNpb25NYW5pZmVzdDtcbn1cblxuLyoqXG4gKiBUaGlzIHJvdXRpbmUgbWFrZXMgdGhlIGZvbGxvd2luZyBhc3N1bXB0aW9uczpcbiAqIFRoZSByb290IGVsZW1lbnQgaXMgYW4gb2JqZWN0IGxpdGVyYWxcbiAqL1xuZnVuY3Rpb24gcmVwbGFjZU5MU3RyaW5ncyhsb2dnZXI6IElMb2dnZXIsIGV4dGVuc2lvbk1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIG1lc3NhZ2VzOiBJVHJhbnNsYXRpb25zLCBvcmlnaW5hbE1lc3NhZ2VzPzogSVRyYW5zbGF0aW9ucyk6IHZvaWQge1xuXHRjb25zdCBwcm9jZXNzRW50cnkgPSAob2JqOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiBzdHJpbmcgfCBudW1iZXIsIGNvbW1hbmQ/OiBib29sZWFuKSA9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBvYmpba2V5XTtcblx0XHRpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRjb25zdCBzdHIgPSB2YWx1ZTtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IHN0ci5sZW5ndGg7XG5cdFx0XHRpZiAobGVuZ3RoID4gMSAmJiBzdHJbMF0gPT09ICclJyAmJiBzdHJbbGVuZ3RoIC0gMV0gPT09ICclJykge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlS2V5ID0gc3RyLnN1YnN0cigxLCBsZW5ndGggLSAyKTtcblx0XHRcdFx0bGV0IHRyYW5zbGF0ZWQgPSBtZXNzYWdlc1ttZXNzYWdlS2V5XTtcblx0XHRcdFx0Ly8gSWYgdGhlIG1lc3NhZ2VzIGNvbWUgZnJvbSBhIGxhbmd1YWdlIHBhY2sgdGhleSBtaWdodCBtaXNzIHNvbWUga2V5c1xuXHRcdFx0XHQvLyBGaWxsIHRoZW0gZnJvbSB0aGUgb3JpZ2luYWwgbWVzc2FnZXMuXG5cdFx0XHRcdGlmICh0cmFuc2xhdGVkID09PSB1bmRlZmluZWQgJiYgb3JpZ2luYWxNZXNzYWdlcykge1xuXHRcdFx0XHRcdHRyYW5zbGF0ZWQgPSBvcmlnaW5hbE1lc3NhZ2VzW21lc3NhZ2VLZXldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHR5cGVvZiB0cmFuc2xhdGVkID09PSAnc3RyaW5nJyA/IHRyYW5zbGF0ZWQgOiB0cmFuc2xhdGVkPy5tZXNzYWdlO1xuXG5cdFx0XHRcdC8vIFRoaXMgYnJhbmNoIHJldHVybnMgSUxvY2FsaXplZFN0cmluZydzIGluc3RlYWQgb2YgU3RyaW5ncyBzbyB0aGF0IHRoZSBDb21tYW5kIFBhbGV0dGUgY2FuIGNvbnRhaW4gYm90aCB0aGUgbG9jYWxpemVkIGFuZCB0aGUgb3JpZ2luYWwgdmFsdWUuXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsID0gb3JpZ2luYWxNZXNzYWdlcz8uW21lc3NhZ2VLZXldO1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbE1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHR5cGVvZiBvcmlnaW5hbCA9PT0gJ3N0cmluZycgPyBvcmlnaW5hbCA6IG9yaWdpbmFsPy5tZXNzYWdlO1xuXG5cdFx0XHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0XHRcdGlmICghb3JpZ2luYWxNZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRsb2dnZXIud2FybihgWyR7ZXh0ZW5zaW9uTWFuaWZlc3QubmFtZX1dOiAke2xvY2FsaXplKCdtaXNzaW5nTkxTS2V5JywgXCJDb3VsZG4ndCBmaW5kIG1lc3NhZ2UgZm9yIGtleSB7MH0uXCIsIG1lc3NhZ2VLZXkpfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0Ly8gaWYgd2UgYXJlIHRyYW5zbGF0aW5nIHRoZSB0aXRsZSBvciBjYXRlZ29yeSBvZiBhIGNvbW1hbmRcblx0XHRcdFx0XHRjb21tYW5kICYmIChrZXkgPT09ICd0aXRsZScgfHwga2V5ID09PSAnY2F0ZWdvcnknKSAmJlxuXHRcdFx0XHRcdC8vIGFuZCB0aGUgb3JpZ2luYWwgdmFsdWUgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSB0cmFuc2xhdGVkIHZhbHVlXG5cdFx0XHRcdFx0b3JpZ2luYWxNZXNzYWdlICYmIG9yaWdpbmFsTWVzc2FnZSAhPT0gbWVzc2FnZVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCBsb2NhbGl6ZWRTdHJpbmc6IElMb2NhbGl6ZWRTdHJpbmcgPSB7XG5cdFx0XHRcdFx0XHR2YWx1ZTogbWVzc2FnZSxcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiBvcmlnaW5hbE1lc3NhZ2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdG9ialtrZXldID0gbG9jYWxpemVkU3RyaW5nO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9ialtrZXldID0gbWVzc2FnZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNPYmplY3QodmFsdWUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGsgaW4gdmFsdWUpIHtcblx0XHRcdFx0aWYgKHZhbHVlLmhhc093blByb3BlcnR5KGspKSB7XG5cdFx0XHRcdFx0ayA9PT0gJ2NvbW1hbmRzJyA/IHByb2Nlc3NFbnRyeSh2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgaywgdHJ1ZSkgOiBwcm9jZXNzRW50cnkodmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGssIGNvbW1hbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAodmFsdWUgYXMgQXJyYXk8dW5rbm93bj4pLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHByb2Nlc3NFbnRyeSh2YWx1ZSwgaSwgY29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGZvciAoY29uc3Qga2V5IGluIGV4dGVuc2lvbk1hbmlmZXN0KSB7XG5cdFx0aWYgKGV4dGVuc2lvbk1hbmlmZXN0Lmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRcdHByb2Nlc3NFbnRyeShleHRlbnNpb25NYW5pZmVzdCwga2V5KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxnQkFBZ0I7QUFHbkMsU0FBUyxnQkFBZ0I7QUFPbEIsU0FBUyxpQkFBaUIsUUFBaUIsbUJBQXVDLGNBQTZCLHNCQUEwRDtBQUMvSyxNQUFJO0FBQ0gscUJBQWlCLFFBQVEsbUJBQW1CLGNBQWMsb0JBQW9CO0FBQUEsRUFDL0UsU0FBUyxPQUFPO0FBQ2YsV0FBTyxNQUFNLE9BQU8sV0FBVyxLQUFLO0FBQUEsRUFFckM7QUFDQSxTQUFPO0FBQ1I7QUFNQSxTQUFTLGlCQUFpQixRQUFpQixtQkFBdUMsVUFBeUIsa0JBQXdDO0FBQ2xKLFFBQU0sZUFBZSxDQUFDLEtBQThCLEtBQXNCLFlBQXNCO0FBQy9GLFVBQU0sUUFBUSxJQUFJLEdBQUc7QUFDckIsUUFBSSxTQUFTLEtBQUssR0FBRztBQUNwQixZQUFNLE1BQU07QUFDWixZQUFNLFNBQVMsSUFBSTtBQUNuQixVQUFJLFNBQVMsS0FBSyxJQUFJLENBQUMsTUFBTSxPQUFPLElBQUksU0FBUyxDQUFDLE1BQU0sS0FBSztBQUM1RCxjQUFNLGFBQWEsSUFBSSxPQUFPLEdBQUcsU0FBUyxDQUFDO0FBQzNDLFlBQUksYUFBYSxTQUFTLFVBQVU7QUFHcEMsWUFBSSxlQUFlLFVBQWEsa0JBQWtCO0FBQ2pELHVCQUFhLGlCQUFpQixVQUFVO0FBQUEsUUFDekM7QUFDQSxjQUFNLFVBQThCLE9BQU8sZUFBZSxXQUFXLGFBQWEsWUFBWTtBQUc5RixjQUFNLFdBQVcsbUJBQW1CLFVBQVU7QUFDOUMsY0FBTSxrQkFBc0MsT0FBTyxhQUFhLFdBQVcsV0FBVyxVQUFVO0FBRWhHLFlBQUksQ0FBQyxTQUFTO0FBQ2IsY0FBSSxDQUFDLGlCQUFpQjtBQUNyQixtQkFBTyxLQUFLLElBQUksa0JBQWtCLElBQUksTUFBTSxTQUFTLGlCQUFpQixzQ0FBc0MsVUFBVSxDQUFDLEVBQUU7QUFBQSxVQUMxSDtBQUNBO0FBQUEsUUFDRDtBQUVBO0FBQUE7QUFBQSxVQUVDLFlBQVksUUFBUSxXQUFXLFFBQVE7QUFBQSxVQUV2QyxtQkFBbUIsb0JBQW9CO0FBQUEsVUFDdEM7QUFDRCxnQkFBTSxrQkFBb0M7QUFBQSxZQUN6QyxPQUFPO0FBQUEsWUFDUCxVQUFVO0FBQUEsVUFDWDtBQUNBLGNBQUksR0FBRyxJQUFJO0FBQUEsUUFDWixPQUFPO0FBQ04sY0FBSSxHQUFHLElBQUk7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FBVyxTQUFTLEtBQUssR0FBRztBQUMzQixpQkFBVyxLQUFLLE9BQU87QUFDdEIsWUFBSSxNQUFNLGVBQWUsQ0FBQyxHQUFHO0FBQzVCLGdCQUFNLGFBQWEsYUFBYSxPQUFrQyxHQUFHLElBQUksSUFBSSxhQUFhLE9BQWtDLEdBQUcsT0FBTztBQUFBLFFBQ3ZJO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FBVyxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ2hDLGVBQVMsSUFBSSxHQUFHLElBQUssTUFBeUIsUUFBUSxLQUFLO0FBQzFELHFCQUFhLE9BQU8sR0FBRyxPQUFPO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLGFBQVcsT0FBTyxtQkFBbUI7QUFDcEMsUUFBSSxrQkFBa0IsZUFBZSxHQUFHLEdBQUc7QUFDMUMsbUJBQWEsbUJBQW1CLEdBQUc7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
