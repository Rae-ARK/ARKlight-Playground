import { FilterType, SortBy } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { EXTENSION_CATEGORIES } from "../../../../platform/extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
class Query {
  constructor(value, sortBy) {
    this.value = value;
    this.sortBy = sortBy;
    this.value = value.trim();
  }
  static suggestions(query, galleryManifest) {
    const commands = ["installed", "updates", "enabled", "disabled", "builtin", "contribute"];
    if (galleryManifest?.capabilities.extensionQuery?.filtering?.some((c) => c.name === FilterType.Featured)) {
      commands.push("featured");
    }
    commands.push(...["mcp", "agentPlugins", "popular", "recommended", "recentlyPublished", "workspaceUnsupported", "deprecated", "sort"]);
    const isCategoriesEnabled = galleryManifest?.capabilities.extensionQuery?.filtering?.some((c) => c.name === FilterType.Category);
    if (isCategoriesEnabled) {
      commands.push("category");
    }
    commands.push(...["tag", "ext", "id", "outdated", "recentlyUpdated", "restartRequired"]);
    const sortCommands = [];
    if (galleryManifest?.capabilities.extensionQuery?.sorting?.some((c) => c.name === SortBy.InstallCount)) {
      sortCommands.push("installs");
    }
    if (galleryManifest?.capabilities.extensionQuery?.sorting?.some((c) => c.name === SortBy.WeightedRating)) {
      sortCommands.push("rating");
    }
    sortCommands.push("name", "publishedDate", "updateDate");
    const contributeCommands = [];
    for (const feature of Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures()) {
      contributeCommands.push(feature.id);
    }
    const subcommands = {
      "sort": sortCommands,
      "category": isCategoriesEnabled ? EXTENSION_CATEGORIES.map((c) => `"${c.toLowerCase()}"`) : [],
      "tag": [""],
      "ext": [""],
      "id": [""],
      "contribute": contributeCommands
    };
    const queryContains = (substr) => query.indexOf(substr) > -1;
    const hasSort = subcommands.sort.some((subcommand) => queryContains(`@sort:${subcommand}`));
    const hasCategory = subcommands.category.some((subcommand) => queryContains(`@category:${subcommand}`));
    return commands.flatMap((command) => {
      if (hasSort && command === "sort" || hasCategory && command === "category") {
        return [];
      }
      if (command in subcommands) {
        return subcommands[command].map((subcommand) => `@${command}:${subcommand}${subcommand === "" ? "" : " "}`);
      } else {
        return queryContains(`@${command}`) ? [] : [`@${command} `];
      }
    });
  }
  static parse(value) {
    let sortBy = "";
    value = value.replace(/@sort:(\w+)(-\w*)?/g, (match, by, order) => {
      sortBy = by;
      return "";
    });
    return new Query(value, sortBy);
  }
  toString() {
    let result = this.value;
    if (this.sortBy) {
      result = `${result}${result ? " " : ""}@sort:${this.sortBy}`;
    }
    return result;
  }
  isValid() {
    return !/@outdated/.test(this.value);
  }
  equals(other) {
    return this.value === other.value && this.sortBy === other.sortBy;
  }
}
export {
  Query
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvblF1ZXJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJUeXBlLCBTb3J0QnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9DQVRFR09SSUVTIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFF1ZXJ5IHtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZywgcHVibGljIHNvcnRCeTogc3RyaW5nKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlLnRyaW0oKTtcblx0fVxuXG5cdHN0YXRpYyBzdWdnZXN0aW9ucyhxdWVyeTogc3RyaW5nLCBnYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgfCBudWxsKTogc3RyaW5nW10ge1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBbJ2luc3RhbGxlZCcsICd1cGRhdGVzJywgJ2VuYWJsZWQnLCAnZGlzYWJsZWQnLCAnYnVpbHRpbicsICdjb250cmlidXRlJ107XG5cdFx0aWYgKGdhbGxlcnlNYW5pZmVzdD8uY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5Py5maWx0ZXJpbmc/LnNvbWUoYyA9PiBjLm5hbWUgPT09IEZpbHRlclR5cGUuRmVhdHVyZWQpKSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKCdmZWF0dXJlZCcpO1xuXHRcdH1cblxuXHRcdGNvbW1hbmRzLnB1c2goLi4uWydtY3AnLCAnYWdlbnRQbHVnaW5zJywgJ3BvcHVsYXInLCAncmVjb21tZW5kZWQnLCAncmVjZW50bHlQdWJsaXNoZWQnLCAnd29ya3NwYWNlVW5zdXBwb3J0ZWQnLCAnZGVwcmVjYXRlZCcsICdzb3J0J10pO1xuXHRcdGNvbnN0IGlzQ2F0ZWdvcmllc0VuYWJsZWQgPSBnYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeT8uZmlsdGVyaW5nPy5zb21lKGMgPT4gYy5uYW1lID09PSBGaWx0ZXJUeXBlLkNhdGVnb3J5KTtcblx0XHRpZiAoaXNDYXRlZ29yaWVzRW5hYmxlZCkge1xuXHRcdFx0Y29tbWFuZHMucHVzaCgnY2F0ZWdvcnknKTtcblx0XHR9XG5cblx0XHRjb21tYW5kcy5wdXNoKC4uLlsndGFnJywgJ2V4dCcsICdpZCcsICdvdXRkYXRlZCcsICdyZWNlbnRseVVwZGF0ZWQnLCAncmVzdGFydFJlcXVpcmVkJ10pO1xuXHRcdGNvbnN0IHNvcnRDb21tYW5kcyA9IFtdO1xuXHRcdGlmIChnYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeT8uc29ydGluZz8uc29tZShjID0+IGMubmFtZSA9PT0gU29ydEJ5Lkluc3RhbGxDb3VudCkpIHtcblx0XHRcdHNvcnRDb21tYW5kcy5wdXNoKCdpbnN0YWxscycpO1xuXHRcdH1cblx0XHRpZiAoZ2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnk/LnNvcnRpbmc/LnNvbWUoYyA9PiBjLm5hbWUgPT09IFNvcnRCeS5XZWlnaHRlZFJhdGluZykpIHtcblx0XHRcdHNvcnRDb21tYW5kcy5wdXNoKCdyYXRpbmcnKTtcblx0XHR9XG5cdFx0c29ydENvbW1hbmRzLnB1c2goJ25hbWUnLCAncHVibGlzaGVkRGF0ZScsICd1cGRhdGVEYXRlJyk7XG5cblx0XHRjb25zdCBjb250cmlidXRlQ29tbWFuZHMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZlYXR1cmUgb2YgUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkuZ2V0RXh0ZW5zaW9uRmVhdHVyZXMoKSkge1xuXHRcdFx0Y29udHJpYnV0ZUNvbW1hbmRzLnB1c2goZmVhdHVyZS5pZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3ViY29tbWFuZHMgPSB7XG5cdFx0XHQnc29ydCc6IHNvcnRDb21tYW5kcyxcblx0XHRcdCdjYXRlZ29yeSc6IGlzQ2F0ZWdvcmllc0VuYWJsZWQgPyBFWFRFTlNJT05fQ0FURUdPUklFUy5tYXAoYyA9PiBgXCIke2MudG9Mb3dlckNhc2UoKX1cImApIDogW10sXG5cdFx0XHQndGFnJzogWycnXSxcblx0XHRcdCdleHQnOiBbJyddLFxuXHRcdFx0J2lkJzogWycnXSxcblx0XHRcdCdjb250cmlidXRlJzogY29udHJpYnV0ZUNvbW1hbmRzXG5cdFx0fSBhcyBjb25zdDtcblxuXHRcdGNvbnN0IHF1ZXJ5Q29udGFpbnMgPSAoc3Vic3RyOiBzdHJpbmcpID0+IHF1ZXJ5LmluZGV4T2Yoc3Vic3RyKSA+IC0xO1xuXHRcdGNvbnN0IGhhc1NvcnQgPSBzdWJjb21tYW5kcy5zb3J0LnNvbWUoc3ViY29tbWFuZCA9PiBxdWVyeUNvbnRhaW5zKGBAc29ydDoke3N1YmNvbW1hbmR9YCkpO1xuXHRcdGNvbnN0IGhhc0NhdGVnb3J5ID0gc3ViY29tbWFuZHMuY2F0ZWdvcnkuc29tZShzdWJjb21tYW5kID0+IHF1ZXJ5Q29udGFpbnMoYEBjYXRlZ29yeToke3N1YmNvbW1hbmR9YCkpO1xuXG5cdFx0cmV0dXJuIGNvbW1hbmRzLmZsYXRNYXAoY29tbWFuZCA9PiB7XG5cdFx0XHRpZiAoaGFzU29ydCAmJiBjb21tYW5kID09PSAnc29ydCcgfHwgaGFzQ2F0ZWdvcnkgJiYgY29tbWFuZCA9PT0gJ2NhdGVnb3J5Jykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29tbWFuZCBpbiBzdWJjb21tYW5kcykge1xuXHRcdFx0XHRyZXR1cm4gKHN1YmNvbW1hbmRzIGFzIFJlY29yZDxzdHJpbmcsIHJlYWRvbmx5IHN0cmluZ1tdPilbY29tbWFuZF1cblx0XHRcdFx0XHQubWFwKHN1YmNvbW1hbmQgPT4gYEAke2NvbW1hbmR9OiR7c3ViY29tbWFuZH0ke3N1YmNvbW1hbmQgPT09ICcnID8gJycgOiAnICd9YCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHF1ZXJ5Q29udGFpbnMoYEAke2NvbW1hbmR9YCkgPyBbXSA6IFtgQCR7Y29tbWFuZH0gYF07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzdGF0aWMgcGFyc2UodmFsdWU6IHN0cmluZyk6IFF1ZXJ5IHtcblx0XHRsZXQgc29ydEJ5ID0gJyc7XG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAobWF0Y2gsIGJ5OiBzdHJpbmcsIG9yZGVyOiBzdHJpbmcpID0+IHtcblx0XHRcdHNvcnRCeSA9IGJ5O1xuXG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIG5ldyBRdWVyeSh2YWx1ZSwgc29ydEJ5KTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMudmFsdWU7XG5cblx0XHRpZiAodGhpcy5zb3J0QnkpIHtcblx0XHRcdHJlc3VsdCA9IGAke3Jlc3VsdH0ke3Jlc3VsdCA/ICcgJyA6ICcnfUBzb3J0OiR7dGhpcy5zb3J0Qnl9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlzVmFsaWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEvQG91dGRhdGVkLy50ZXN0KHRoaXMudmFsdWUpO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBRdWVyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSAmJiB0aGlzLnNvcnRCeSA9PT0gb3RoZXIuc29ydEJ5O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFlBQVksY0FBYztBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUE4QztBQUVoRCxNQUFNLE1BQU07QUFBQSxFQUVsQixZQUFtQixPQUFzQixRQUFnQjtBQUF0QztBQUFzQjtBQUN4QyxTQUFLLFFBQVEsTUFBTSxLQUFLO0FBQUEsRUFDekI7QUFBQSxFQUVBLE9BQU8sWUFBWSxPQUFlLGlCQUE2RDtBQUU5RixVQUFNLFdBQVcsQ0FBQyxhQUFhLFdBQVcsV0FBVyxZQUFZLFdBQVcsWUFBWTtBQUN4RixRQUFJLGlCQUFpQixhQUFhLGdCQUFnQixXQUFXLEtBQUssT0FBSyxFQUFFLFNBQVMsV0FBVyxRQUFRLEdBQUc7QUFDdkcsZUFBUyxLQUFLLFVBQVU7QUFBQSxJQUN6QjtBQUVBLGFBQVMsS0FBSyxHQUFHLENBQUMsT0FBTyxnQkFBZ0IsV0FBVyxlQUFlLHFCQUFxQix3QkFBd0IsY0FBYyxNQUFNLENBQUM7QUFDckksVUFBTSxzQkFBc0IsaUJBQWlCLGFBQWEsZ0JBQWdCLFdBQVcsS0FBSyxPQUFLLEVBQUUsU0FBUyxXQUFXLFFBQVE7QUFDN0gsUUFBSSxxQkFBcUI7QUFDeEIsZUFBUyxLQUFLLFVBQVU7QUFBQSxJQUN6QjtBQUVBLGFBQVMsS0FBSyxHQUFHLENBQUMsT0FBTyxPQUFPLE1BQU0sWUFBWSxtQkFBbUIsaUJBQWlCLENBQUM7QUFDdkYsVUFBTSxlQUFlLENBQUM7QUFDdEIsUUFBSSxpQkFBaUIsYUFBYSxnQkFBZ0IsU0FBUyxLQUFLLE9BQUssRUFBRSxTQUFTLE9BQU8sWUFBWSxHQUFHO0FBQ3JHLG1CQUFhLEtBQUssVUFBVTtBQUFBLElBQzdCO0FBQ0EsUUFBSSxpQkFBaUIsYUFBYSxnQkFBZ0IsU0FBUyxLQUFLLE9BQUssRUFBRSxTQUFTLE9BQU8sY0FBYyxHQUFHO0FBQ3ZHLG1CQUFhLEtBQUssUUFBUTtBQUFBLElBQzNCO0FBQ0EsaUJBQWEsS0FBSyxRQUFRLGlCQUFpQixZQUFZO0FBRXZELFVBQU0scUJBQXFCLENBQUM7QUFDNUIsZUFBVyxXQUFXLFNBQVMsR0FBK0IsV0FBVyx5QkFBeUIsRUFBRSxxQkFBcUIsR0FBRztBQUMzSCx5QkFBbUIsS0FBSyxRQUFRLEVBQUU7QUFBQSxJQUNuQztBQUVBLFVBQU0sY0FBYztBQUFBLE1BQ25CLFFBQVE7QUFBQSxNQUNSLFlBQVksc0JBQXNCLHFCQUFxQixJQUFJLE9BQUssSUFBSSxFQUFFLFlBQVksQ0FBQyxHQUFHLElBQUksQ0FBQztBQUFBLE1BQzNGLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDVixPQUFPLENBQUMsRUFBRTtBQUFBLE1BQ1YsTUFBTSxDQUFDLEVBQUU7QUFBQSxNQUNULGNBQWM7QUFBQSxJQUNmO0FBRUEsVUFBTSxnQkFBZ0IsQ0FBQyxXQUFtQixNQUFNLFFBQVEsTUFBTSxJQUFJO0FBQ2xFLFVBQU0sVUFBVSxZQUFZLEtBQUssS0FBSyxnQkFBYyxjQUFjLFNBQVMsVUFBVSxFQUFFLENBQUM7QUFDeEYsVUFBTSxjQUFjLFlBQVksU0FBUyxLQUFLLGdCQUFjLGNBQWMsYUFBYSxVQUFVLEVBQUUsQ0FBQztBQUVwRyxXQUFPLFNBQVMsUUFBUSxhQUFXO0FBQ2xDLFVBQUksV0FBVyxZQUFZLFVBQVUsZUFBZSxZQUFZLFlBQVk7QUFDM0UsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUNBLFVBQUksV0FBVyxhQUFhO0FBQzNCLGVBQVEsWUFBa0QsT0FBTyxFQUMvRCxJQUFJLGdCQUFjLElBQUksT0FBTyxJQUFJLFVBQVUsR0FBRyxlQUFlLEtBQUssS0FBSyxHQUFHLEVBQUU7QUFBQSxNQUMvRSxPQUNLO0FBQ0osZUFBTyxjQUFjLElBQUksT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxPQUFPLEdBQUc7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE9BQU8sTUFBTSxPQUFzQjtBQUNsQyxRQUFJLFNBQVM7QUFDYixZQUFRLE1BQU0sUUFBUSx1QkFBdUIsQ0FBQyxPQUFPLElBQVksVUFBa0I7QUFDbEYsZUFBUztBQUVULGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxXQUFPLElBQUksTUFBTSxPQUFPLE1BQU07QUFBQSxFQUMvQjtBQUFBLEVBRUEsV0FBbUI7QUFDbEIsUUFBSSxTQUFTLEtBQUs7QUFFbEIsUUFBSSxLQUFLLFFBQVE7QUFDaEIsZUFBUyxHQUFHLE1BQU0sR0FBRyxTQUFTLE1BQU0sRUFBRSxTQUFTLEtBQUssTUFBTTtBQUFBLElBQzNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFVBQW1CO0FBQ2xCLFdBQU8sQ0FBQyxZQUFZLEtBQUssS0FBSyxLQUFLO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE9BQU8sT0FBdUI7QUFDN0IsV0FBTyxLQUFLLFVBQVUsTUFBTSxTQUFTLEtBQUssV0FBVyxNQUFNO0FBQUEsRUFDNUQ7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
