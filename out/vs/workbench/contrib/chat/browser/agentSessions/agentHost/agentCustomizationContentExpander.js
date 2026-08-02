import { extname } from "../../../../../../base/common/path.js";
import { joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { parseFrontMatter } from "../../../../../../base/common/yaml.js";
import { SKILL_FILENAME } from "../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
class AgentCustomizationContentExpander {
  constructor(fileService, logService) {
    this.fileService = fileService;
    this.logService = logService;
  }
  async expandPluginContents(pluginUri, groupKey, isBundleItem, source, pluginLabel, token) {
    const fsRoot = pluginUri;
    const children = [];
    try {
      if (!await this.fileService.canHandleResource(fsRoot)) {
        return [];
      }
      if (token.isCancellationRequested) {
        return [];
      }
      const dirNames = ["agents", "skills", "commands", "rules"];
      const promptTypes = [PromptsType.agent, PromptsType.skill, PromptsType.prompt, PromptsType.instructions];
      const stats = await this.fileService.resolveAll(dirNames.map((name) => ({ resource: URI.joinPath(fsRoot, name) })));
      if (token.isCancellationRequested) {
        return [];
      }
      for (let i = 0; i < dirNames.length; i++) {
        const stat = stats[i];
        const promptType = promptTypes[i];
        if (!stat.success || !stat.stat?.isDirectory || !stat.stat.children) {
          continue;
        }
        if (promptType === PromptsType.skill) {
          children.push(...await this.collectFromSkillDir(stat.stat.children, pluginUri, source, groupKey, isBundleItem, pluginLabel, token));
        } else {
          children.push(...await this.collectFromRegularDir(stat.stat.children, pluginUri, source, promptType, groupKey, isBundleItem, pluginLabel, token));
        }
      }
      children.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
    } catch (err) {
      this.logService.trace(`[AgentCustomizationContentExpander] Failed to expand plugin ${pluginUri.toString()}: ${err}`);
      return [];
    }
    return children;
  }
  /**
   * Emits one item per skill subfolder that contains a SKILL.md file.
   * The skill metadata comes from SKILL.md frontmatter.
   */
  async collectFromSkillDir(entries, pluginUri, source, groupKey, isBundleItem, pluginLabel, token) {
    const eligible = [];
    const readMetaDataPromises = [];
    for (const child of entries) {
      if (child.name.startsWith(".")) {
        continue;
      }
      if (!child.isDirectory) {
        continue;
      }
      eligible.push(child);
      readMetaDataPromises.push(this.readPromptMetadata(joinPath(child.resource, SKILL_FILENAME), token));
    }
    const promptMetadata = await Promise.all(readMetaDataPromises);
    if (token.isCancellationRequested) {
      return [];
    }
    const items = [];
    for (let i = 0; i < eligible.length; i++) {
      const child = eligible[i];
      const meta = promptMetadata[i];
      if (!meta) {
        continue;
      }
      const uri = joinPath(child.resource, SKILL_FILENAME);
      const name = meta.name ?? child.name;
      const description = meta.description;
      const userInvocable = meta.userInvocable;
      items.push({
        uri,
        type: PromptsType.skill,
        name,
        description,
        source,
        groupKey,
        extensionId: void 0,
        pluginUri: isBundleItem ? void 0 : pluginUri,
        pluginLabel: isBundleItem ? void 0 : pluginLabel,
        userInvocable
      });
    }
    return items;
  }
  /**
   * Emits one item per markdown file for agent/rules/command folders.
   * Agents and instructions read frontmatter name/description, and
   * agents additionally surface userInvocable. Instruction (rules)
   * folders additionally accept `.mdc` files per the Open Plugins spec.
   */
  async collectFromRegularDir(entries, pluginUri, source, promptType, groupKey, isBundleItem, pluginLabel, token) {
    const eligible = [];
    for (const child of entries) {
      if (child.name.startsWith(".")) {
        continue;
      }
      if (child.isDirectory) {
        continue;
      }
      const ext = extname(child.name);
      if (ext !== ".md" && !(promptType === PromptsType.instructions && ext === ".mdc")) {
        continue;
      }
      eligible.push(child);
    }
    const parseMetadata = promptType === PromptsType.agent || promptType === PromptsType.instructions;
    const promptMetadata = parseMetadata ? await Promise.all(eligible.map((child) => this.readPromptMetadata(child.resource, token))) : void 0;
    if (token.isCancellationRequested) {
      return [];
    }
    const items = [];
    for (let i = 0; i < eligible.length; i++) {
      const child = eligible[i];
      const meta = promptMetadata?.[i];
      items.push({
        uri: child.resource,
        type: promptType,
        name: meta?.name ?? stripPromptFileExtensions(child.name),
        description: meta?.description,
        source,
        groupKey,
        extensionId: void 0,
        pluginUri: isBundleItem ? void 0 : pluginUri,
        pluginLabel: isBundleItem ? void 0 : pluginLabel,
        userInvocable: promptType === PromptsType.agent ? meta?.userInvocable : void 0
      });
    }
    return items;
  }
  /**
   * Reads a prompt markdown file and returns selected frontmatter
   * metadata. Returns `undefined` when the file is not markdown, or
   * when it cannot be read/parsed.
   */
  async readPromptMetadata(promptFileUri, token) {
    if (extname(promptFileUri.path) !== ".md") {
      return void 0;
    }
    try {
      const content = await this.fileService.readFile(promptFileUri);
      if (token.isCancellationRequested) {
        return void 0;
      }
      const frontmatter = parseFrontMatter(content.value.toString());
      if (frontmatter) {
        const name = frontmatter.getStringValue("name");
        const description = frontmatter.getStringValue("description");
        const userInvocableStr = frontmatter.getStringValue("user-invocable");
        const userInvocable = userInvocableStr === "true" ? true : userInvocableStr === "false" ? false : void 0;
        return { name, description, userInvocable };
      }
      return { name: void 0, description: void 0, userInvocable: void 0 };
    } catch (err) {
      this.logService.trace(`[AgentCustomizationContentExpander] Failed to read prompt metadata ${promptFileUri.toString()}: ${err}`);
      return void 0;
    }
  }
}
function stripPromptFileExtensions(filename) {
  const ext = extname(filename);
  if (!ext) {
    return filename;
  }
  const stem = filename.slice(0, -ext.length);
  const dotInStem = stem.lastIndexOf(".");
  return dotInStem > 0 ? stem.slice(0, dotInStem) : stem;
}
export {
  AgentCustomizationContentExpander
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcGFyc2VGcm9udE1hdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3lhbWwuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTS0lMTF9GSUxFTkFNRSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcblxuLyoqXG4gKiBFeHBhbmRzIHBsdWdpbiByb290cyBpbnRvIGluZGl2aWR1YWwgY3VzdG9taXphdGlvbiBpdGVtcyBieSBzY2FubmluZyB0aGVcbiAqIGNhbm9uaWNhbCBzdWJmb2xkZXJzIChhZ2VudHMvc2tpbGxzL2NvbW1hbmRzL3J1bGVzKS5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgZXhwYW5kUGx1Z2luQ29udGVudHMocGx1Z2luVXJpOiBVUkksIGdyb3VwS2V5OiBzdHJpbmcsIGlzQnVuZGxlSXRlbTogYm9vbGVhbiwgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIHBsdWdpbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0XHQvLyBwbHVnaW5VcmkgaXMgYWxyZWFkeSBhbiBhZ2VudC1ob3N0Oi8vIFVSSSAoZnJvbSB0b1JlbW90ZVVyaSksXG5cdFx0Ly8gc28gdXNlIGl0IGRpcmVjdGx5IGFzIHRoZSBmaWxlc3lzdGVtIHJvb3QuXG5cdFx0Y29uc3QgZnNSb290ID0gcGx1Z2luVXJpO1xuXHRcdGNvbnN0IGNoaWxkcmVuOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UoZnNSb290KSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXJOYW1lcyA9IFsnYWdlbnRzJywgJ3NraWxscycsICdjb21tYW5kcycsICdydWxlcyddIGFzIGNvbnN0O1xuXHRcdFx0Y29uc3QgcHJvbXB0VHlwZXMgPSBbUHJvbXB0c1R5cGUuYWdlbnQsIFByb21wdHNUeXBlLnNraWxsLCBQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNUeXBlLmluc3RydWN0aW9uc10gYXMgY29uc3Q7XG5cdFx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZUFsbChkaXJOYW1lcy5tYXAobmFtZSA9PiAoeyByZXNvdXJjZTogVVJJLmpvaW5QYXRoKGZzUm9vdCwgbmFtZSkgfSkpKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkaXJOYW1lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gc3RhdHNbaV07XG5cdFx0XHRcdGNvbnN0IHByb21wdFR5cGUgPSBwcm9tcHRUeXBlc1tpXTtcblx0XHRcdFx0aWYgKCFzdGF0LnN1Y2Nlc3MgfHwgIXN0YXQuc3RhdD8uaXNEaXJlY3RvcnkgfHwgIXN0YXQuc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goLi4uYXdhaXQgdGhpcy5jb2xsZWN0RnJvbVNraWxsRGlyKHN0YXQuc3RhdC5jaGlsZHJlbiwgcGx1Z2luVXJpLCBzb3VyY2UsIGdyb3VwS2V5LCBpc0J1bmRsZUl0ZW0sIHBsdWdpbkxhYmVsLCB0b2tlbikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goLi4uYXdhaXQgdGhpcy5jb2xsZWN0RnJvbVJlZ3VsYXJEaXIoc3RhdC5zdGF0LmNoaWxkcmVuLCBwbHVnaW5VcmksIHNvdXJjZSwgcHJvbXB0VHlwZSwgZ3JvdXBLZXksIGlzQnVuZGxlSXRlbSwgcGx1Z2luTGFiZWwsIHRva2VuKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNoaWxkcmVuLnNvcnQoKGEsIGIpID0+IGAke2EudHlwZX06JHthLm5hbWV9YC5sb2NhbGVDb21wYXJlKGAke2IudHlwZX06JHtiLm5hbWV9YCkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyXSBGYWlsZWQgdG8gZXhwYW5kIHBsdWdpbiAke3BsdWdpblVyaS50b1N0cmluZygpfTogJHtlcnJ9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBjaGlsZHJlbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbWl0cyBvbmUgaXRlbSBwZXIgc2tpbGwgc3ViZm9sZGVyIHRoYXQgY29udGFpbnMgYSBTS0lMTC5tZCBmaWxlLlxuXHQgKiBUaGUgc2tpbGwgbWV0YWRhdGEgY29tZXMgZnJvbSBTS0lMTC5tZCBmcm9udG1hdHRlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgY29sbGVjdEZyb21Ta2lsbERpcihlbnRyaWVzOiByZWFkb25seSB7IG5hbWU6IHN0cmluZzsgcmVzb3VyY2U6IFVSSTsgaXNEaXJlY3Rvcnk6IGJvb2xlYW4gfVtdLCBwbHVnaW5Vcmk6IFVSSSwgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIGdyb3VwS2V5OiBzdHJpbmcsIGlzQnVuZGxlSXRlbTogYm9vbGVhbiwgcGx1Z2luTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdHR5cGUgRW50cnkgPSB7IG5hbWU6IHN0cmluZzsgcmVzb3VyY2U6IFVSSTsgaXNEaXJlY3Rvcnk6IGJvb2xlYW4gfTtcblx0XHRjb25zdCBlbGlnaWJsZTogRW50cnlbXSA9IFtdO1xuXHRcdGNvbnN0IHJlYWRNZXRhRGF0YVByb21pc2VzID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBlbnRyaWVzKSB7XG5cdFx0XHQvLyBTa2lwIGRvdGZpbGVzIChlLmcuIC5EU19TdG9yZSlcblx0XHRcdGlmIChjaGlsZC5uYW1lLnN0YXJ0c1dpdGgoJy4nKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghY2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbGlnaWJsZS5wdXNoKGNoaWxkKTtcblx0XHRcdHJlYWRNZXRhRGF0YVByb21pc2VzLnB1c2godGhpcy5yZWFkUHJvbXB0TWV0YWRhdGEoam9pblBhdGgoY2hpbGQucmVzb3VyY2UsIFNLSUxMX0ZJTEVOQU1FKSwgdG9rZW4pKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9tcHRNZXRhZGF0YSA9IGF3YWl0IFByb21pc2UuYWxsKHJlYWRNZXRhRGF0YVByb21pc2VzKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsaWdpYmxlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IGVsaWdpYmxlW2ldO1xuXHRcdFx0Y29uc3QgbWV0YSA9IHByb21wdE1ldGFkYXRhW2ldO1xuXHRcdFx0aWYgKCFtZXRhKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXJpID0gam9pblBhdGgoY2hpbGQucmVzb3VyY2UsIFNLSUxMX0ZJTEVOQU1FKTtcblx0XHRcdGNvbnN0IG5hbWUgPSBtZXRhLm5hbWUgPz8gY2hpbGQubmFtZTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbWV0YS5kZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGUgPSBtZXRhLnVzZXJJbnZvY2FibGU7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0bmFtZTogbmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0Z3JvdXBLZXksXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogaXNCdW5kbGVJdGVtID8gdW5kZWZpbmVkIDogcGx1Z2luVXJpLFxuXHRcdFx0XHRwbHVnaW5MYWJlbDogaXNCdW5kbGVJdGVtID8gdW5kZWZpbmVkIDogcGx1Z2luTGFiZWwsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGVcblx0XHRcdH0gc2F0aXNmaWVzIElDdXN0b21pemF0aW9uSXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdC8qKlxuXHQgKiBFbWl0cyBvbmUgaXRlbSBwZXIgbWFya2Rvd24gZmlsZSBmb3IgYWdlbnQvcnVsZXMvY29tbWFuZCBmb2xkZXJzLlxuXHQgKiBBZ2VudHMgYW5kIGluc3RydWN0aW9ucyByZWFkIGZyb250bWF0dGVyIG5hbWUvZGVzY3JpcHRpb24sIGFuZFxuXHQgKiBhZ2VudHMgYWRkaXRpb25hbGx5IHN1cmZhY2UgdXNlckludm9jYWJsZS4gSW5zdHJ1Y3Rpb24gKHJ1bGVzKVxuXHQgKiBmb2xkZXJzIGFkZGl0aW9uYWxseSBhY2NlcHQgYC5tZGNgIGZpbGVzIHBlciB0aGUgT3BlbiBQbHVnaW5zIHNwZWMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RGcm9tUmVndWxhckRpcihlbnRyaWVzOiByZWFkb25seSB7IG5hbWU6IHN0cmluZzsgcmVzb3VyY2U6IFVSSTsgaXNEaXJlY3Rvcnk6IGJvb2xlYW4gfVtdLCBwbHVnaW5Vcmk6IFVSSSwgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBncm91cEtleTogc3RyaW5nLCBpc0J1bmRsZUl0ZW06IGJvb2xlYW4sIHBsdWdpbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0XHR0eXBlIEVudHJ5ID0geyBuYW1lOiBzdHJpbmc7IHJlc291cmNlOiBVUkk7IGlzRGlyZWN0b3J5OiBib29sZWFuIH07XG5cdFx0Y29uc3QgZWxpZ2libGU6IEVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVudHJpZXMpIHtcblx0XHRcdGlmIChjaGlsZC5uYW1lLnN0YXJ0c1dpdGgoJy4nKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4dCA9IGV4dG5hbWUoY2hpbGQubmFtZSk7XG5cdFx0XHRpZiAoZXh0ICE9PSAnLm1kJyAmJiAhKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyAmJiBleHQgPT09ICcubWRjJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbGlnaWJsZS5wdXNoKGNoaWxkKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZU1ldGFkYXRhID0gcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQgfHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zO1xuXHRcdGNvbnN0IHByb21wdE1ldGFkYXRhID0gcGFyc2VNZXRhZGF0YSA/IGF3YWl0IFByb21pc2UuYWxsKGVsaWdpYmxlLm1hcChjaGlsZCA9PiB0aGlzLnJlYWRQcm9tcHRNZXRhZGF0YShjaGlsZC5yZXNvdXJjZSwgdG9rZW4pKSkgOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsaWdpYmxlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IGVsaWdpYmxlW2ldO1xuXHRcdFx0Y29uc3QgbWV0YSA9IHByb21wdE1ldGFkYXRhPy5baV07XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0dXJpOiBjaGlsZC5yZXNvdXJjZSxcblx0XHRcdFx0dHlwZTogcHJvbXB0VHlwZSxcblx0XHRcdFx0bmFtZTogbWV0YT8ubmFtZSA/PyBzdHJpcFByb21wdEZpbGVFeHRlbnNpb25zKGNoaWxkLm5hbWUpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbWV0YT8uZGVzY3JpcHRpb24sXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0Z3JvdXBLZXksXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogaXNCdW5kbGVJdGVtID8gdW5kZWZpbmVkIDogcGx1Z2luVXJpLFxuXHRcdFx0XHRwbHVnaW5MYWJlbDogaXNCdW5kbGVJdGVtID8gdW5kZWZpbmVkIDogcGx1Z2luTGFiZWwsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50ID8gbWV0YT8udXNlckludm9jYWJsZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0gc2F0aXNmaWVzIElDdXN0b21pemF0aW9uSXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhIHByb21wdCBtYXJrZG93biBmaWxlIGFuZCByZXR1cm5zIHNlbGVjdGVkIGZyb250bWF0dGVyXG5cdCAqIG1ldGFkYXRhLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIGZpbGUgaXMgbm90IG1hcmtkb3duLCBvclxuXHQgKiB3aGVuIGl0IGNhbm5vdCBiZSByZWFkL3BhcnNlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcmVhZFByb21wdE1ldGFkYXRhKHByb21wdEZpbGVVcmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDsgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDsgdXNlckludm9jYWJsZTogYm9vbGVhbiB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGV4dG5hbWUocHJvbXB0RmlsZVVyaS5wYXRoKSAhPT0gJy5tZCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShwcm9tcHRGaWxlVXJpKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZnJvbnRtYXR0ZXIgPSBwYXJzZUZyb250TWF0dGVyKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoZnJvbnRtYXR0ZXIpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IGZyb250bWF0dGVyLmdldFN0cmluZ1ZhbHVlKCduYW1lJyk7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZnJvbnRtYXR0ZXIuZ2V0U3RyaW5nVmFsdWUoJ2Rlc2NyaXB0aW9uJyk7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGVTdHIgPSBmcm9udG1hdHRlci5nZXRTdHJpbmdWYWx1ZSgndXNlci1pbnZvY2FibGUnKTtcblx0XHRcdFx0Y29uc3QgdXNlckludm9jYWJsZSA9IHVzZXJJbnZvY2FibGVTdHIgPT09ICd0cnVlJyA/IHRydWUgOiB1c2VySW52b2NhYmxlU3RyID09PSAnZmFsc2UnID8gZmFsc2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB7IG5hbWUsIGRlc2NyaXB0aW9uLCB1c2VySW52b2NhYmxlIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBuYW1lOiB1bmRlZmluZWQsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsIHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyXSBGYWlsZWQgdG8gcmVhZCBwcm9tcHQgbWV0YWRhdGEgJHtwcm9tcHRGaWxlVXJpLnRvU3RyaW5nKCl9OiAke2Vycn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogU3RyaXBzIGNvbnZlbnRpb25hbCBwcm9tcHQgZmlsZSBleHRlbnNpb25zIHNvIHdlIGNhbiBzaG93IGBmb29gXG4gKiBmb3IgYGZvby5wcm9tcHQubWRgLCBgZm9vLmluc3RydWN0aW9ucy5tZGAsIGV0Yy5cbiAqL1xuZnVuY3Rpb24gc3RyaXBQcm9tcHRGaWxlRXh0ZW5zaW9ucyhmaWxlbmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgZXh0ID0gZXh0bmFtZShmaWxlbmFtZSk7XG5cdGlmICghZXh0KSB7XG5cdFx0cmV0dXJuIGZpbGVuYW1lO1xuXHR9XG5cdGNvbnN0IHN0ZW0gPSBmaWxlbmFtZS5zbGljZSgwLCAtZXh0Lmxlbmd0aCk7XG5cdGNvbnN0IGRvdEluU3RlbSA9IHN0ZW0ubGFzdEluZGV4T2YoJy4nKTtcblx0cmV0dXJuIGRvdEluU3RlbSA+IDAgPyBzdGVtLnNsaWNlKDAsIGRvdEluU3RlbSkgOiBzdGVtO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUtqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQU1yQixNQUFNLGtDQUFrQztBQUFBLEVBRTlDLFlBQ2tCLGFBQ0EsWUFDaEI7QUFGZ0I7QUFDQTtBQUFBLEVBRWxCO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixXQUFnQixVQUFrQixjQUF1QixRQUErQixhQUFpQyxPQUFrRTtBQUdyTixVQUFNLFNBQVM7QUFDZixVQUFNLFdBQWlDLENBQUM7QUFDeEMsUUFBSTtBQUNILFVBQUksQ0FBQyxNQUFNLEtBQUssWUFBWSxrQkFBa0IsTUFBTSxHQUFHO0FBQ3RELGVBQU8sQ0FBQztB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
