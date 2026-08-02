import { URI } from "../../../base/common/uri.js";
function createNodeTrees(nodes) {
  if (nodes.length === 0) {
    return [];
  }
  const nodeLookup = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    nodeLookup.set(node.nodeId, node);
  }
  function getNonIgnoredDescendants(nodeId) {
    const node = nodeLookup.get(nodeId);
    if (!node || !node.childIds) {
      return [];
    }
    const result = [];
    for (const childId of node.childIds) {
      const childNode = nodeLookup.get(childId);
      if (!childNode) {
        continue;
      }
      if (childNode.ignored) {
        result.push(...getNonIgnoredDescendants(childId));
      } else {
        result.push(childId);
      }
    }
    return result;
  }
  const nodeMap = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (!node.ignored) {
      nodeMap.set(node.nodeId, { node, children: [], parent: null });
    }
  }
  for (const node of nodes) {
    if (node.ignored) {
      continue;
    }
    const treeNode = nodeMap.get(node.nodeId);
    if (node.childIds) {
      for (const childId of node.childIds) {
        const childNode = nodeLookup.get(childId);
        if (!childNode) {
          continue;
        }
        if (childNode.ignored) {
          const nonIgnoredDescendants = getNonIgnoredDescendants(childId);
          for (const descendantId of nonIgnoredDescendants) {
            const descendantTreeNode = nodeMap.get(descendantId);
            if (descendantTreeNode) {
              descendantTreeNode.parent = treeNode;
              treeNode.children.push(descendantTreeNode);
            }
          }
        } else {
          const childTreeNode = nodeMap.get(childId);
          if (childTreeNode) {
            childTreeNode.parent = treeNode;
            treeNode.children.push(childTreeNode);
          }
        }
      }
    }
  }
  const roots = [];
  for (const node of nodeMap.values()) {
    if (!node.parent) {
      roots.push(node);
    }
  }
  return roots;
}
const LINE_MAX_LENGTH = 80;
function convertAXTreeToMarkdown(uri, axNodes) {
  const trees = createNodeTrees(axNodes);
  if (trees.length === 0) {
    return "";
  }
  const allMainContent = [];
  const allNavLinks = [];
  for (const tree of trees) {
    const mainContent = extractMainContent(uri, tree);
    const navLinks = collectNavigationLinks(tree);
    if (mainContent.trim().length > 0) {
      allMainContent.push(mainContent);
    }
    allNavLinks.push(...navLinks);
  }
  const combinedMainContent = allMainContent.join("\n\n");
  return combinedMainContent + (allNavLinks.length > 0 ? "\n\n## Additional Links\n" + allNavLinks.join("\n") : "");
}
function extractMainContent(uri, tree) {
  const contentBuffer = [];
  processNode(uri, tree, contentBuffer, 0, true);
  return contentBuffer.join("");
}
function processNode(uri, node, buffer, depth, allowWrap) {
  const role = getNodeRole(node.node);
  switch (role) {
    case "navigation":
      return;
    // Skip navigation nodes
    case "heading":
      processHeadingNode(uri, node, buffer, depth);
      return;
    case "paragraph":
      processParagraphNode(uri, node, buffer, depth, allowWrap);
      return;
    case "list":
      buffer.push("\n");
      for (const descChild of node.children) {
        processNode(uri, descChild, buffer, depth + 1, true);
      }
      buffer.push("\n");
      return;
    case "ListMarker":
      buffer.push(getNodeText(node.node, allowWrap));
      return;
    case "listitem": {
      const tempBuffer = [];
      for (const descChild of node.children) {
        processNode(uri, descChild, tempBuffer, depth + 1, true);
      }
      const indent = getLevel(node.node) > 1 ? " ".repeat(getLevel(node.node)) : "";
      buffer.push(`${indent}${tempBuffer.join("").trim()}
`);
      return;
    }
    case "link":
      if (!isNavigationLink(node)) {
        const linkText = getNodeText(node.node, allowWrap);
        const url = getLinkUrl(node.node);
        if (!isSameUriIgnoringQueryAndFragment(uri, node.node)) {
          buffer.push(`[${linkText}](${url})`);
        } else {
          buffer.push(linkText);
        }
      }
      return;
    case "StaticText": {
      const staticText = getNodeText(node.node, allowWrap);
      if (staticText) {
        buffer.push(staticText);
      }
      break;
    }
    case "image": {
      const altText = getNodeText(node.node, allowWrap) || "Image";
      const imageUrl = getImageUrl(node.node);
      if (imageUrl) {
        buffer.push(`![${altText}](${imageUrl})

`);
      } else {
        buffer.push(`[Image: ${altText}]

`);
      }
      break;
    }
    case "DescriptionList":
      processDescriptionListNode(uri, node, buffer, depth);
      return;
    case "blockquote":
      buffer.push("> " + getNodeText(node.node, allowWrap).replace(/\n/g, "\n> ") + "\n\n");
      break;
    // TODO: Is this the correct way to handle the generic role?
    case "generic":
      buffer.push(" ");
      break;
    case "code": {
      processCodeNode(uri, node, buffer, depth);
      return;
    }
    case "pre":
      buffer.push("```\n" + getNodeText(node.node, false) + "\n```\n\n");
      break;
    case "table":
      processTableNode(node, buffer);
      return;
  }
  for (const child of node.children) {
    processNode(uri, child, buffer, depth + 1, allowWrap);
  }
}
function getNodeRole(node) {
  return node.role?.value || "";
}
function getNodeText(node, allowWrap) {
  const text = node.name?.value || node.value?.value || "";
  if (!allowWrap) {
    return text;
  }
  if (text.length <= LINE_MAX_LENGTH) {
    return text;
  }
  const chars = text.split("");
  let lastSpaceIndex = -1;
  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === " ") {
      lastSpaceIndex = i;
    }
    if (i % LINE_MAX_LENGTH === 0 && lastSpaceIndex !== -1) {
      chars[lastSpaceIndex] = "\n";
      lastSpaceIndex = i;
    }
  }
  return chars.join("");
}
function getLevel(node) {
  const levelProp = node.properties?.find((p) => p.name === "level");
  return levelProp ? Math.min(Number(levelProp.value.value) || 1, 6) : 1;
}
function getLinkUrl(node) {
  const urlProp = node.properties?.find((p) => p.name === "url");
  return urlProp?.value.value || "#";
}
function getImageUrl(node) {
  const urlProp = node.properties?.find((p) => p.name === "url");
  return urlProp?.value.value || null;
}
function isNavigationLink(node) {
  let current = node;
  while (current) {
    const role = getNodeRole(current.node);
    if (["navigation", "menu", "menubar"].includes(role)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
function isSameUriIgnoringQueryAndFragment(uri, node) {
  const link = getLinkUrl(node);
  try {
    const parsed = URI.parse(link);
    return parsed.scheme === uri.scheme && parsed.authority === uri.authority && parsed.path === uri.path;
  } catch (e) {
    return false;
  }
}
function processParagraphNode(uri, node, buffer, depth, allowWrap) {
  buffer.push("\n");
  for (const child of node.children) {
    processNode(uri, child, buffer, depth + 1, allowWrap);
  }
  buffer.push("\n\n");
}
function processHeadingNode(uri, node, buffer, depth) {
  buffer.push("\n");
  const level = getLevel(node.node);
  buffer.push(`${"#".repeat(level)} `);
  for (const child of node.children) {
    if (getNodeRole(child.node) === "StaticText") {
      buffer.push(getNodeText(child.node, false));
    } else {
      processNode(uri, child, buffer, depth + 1, false);
    }
  }
  buffer.push("\n\n");
}
function processDescriptionListNode(uri, node, buffer, depth) {
  buffer.push("\n");
  for (const child of node.children) {
    if (getNodeRole(child.node) === "term") {
      buffer.push("- **");
      for (const termChild of child.children) {
        processNode(uri, termChild, buffer, depth + 1, true);
      }
      buffer.push("** ");
    } else if (getNodeRole(child.node) === "definition") {
      for (const descChild of child.children) {
        processNode(uri, descChild, buffer, depth + 1, true);
      }
      buffer.push("\n");
    }
  }
  buffer.push("\n");
}
function isTableCell(role) {
  return role === "cell" || role === "gridcell" || role === "columnheader" || role === "rowheader";
}
function processTableNode(node, buffer) {
  buffer.push("\n");
  const rows = node.children.filter((child) => getNodeRole(child.node).includes("row"));
  if (rows.length > 0) {
    const headerCells = rows[0].children.filter((cell) => isTableCell(getNodeRole(cell.node)));
    const headerContent = headerCells.map((cell) => getNodeText(cell.node, false) || " ");
    buffer.push("| " + headerContent.join(" | ") + " |\n");
    buffer.push("| " + headerCells.map(() => "---").join(" | ") + " |\n");
    for (let i = 1; i < rows.length; i++) {
      const dataCells = rows[i].children.filter((cell) => isTableCell(getNodeRole(cell.node)));
      const rowContent = dataCells.map((cell) => getNodeText(cell.node, false) || " ");
      buffer.push("| " + rowContent.join(" | ") + " |\n");
    }
  }
  buffer.push("\n");
}
function processCodeNode(uri, node, buffer, depth) {
  const tempBuffer = [];
  for (const child of node.children) {
    processNode(uri, child, tempBuffer, depth + 1, false);
  }
  const isCodeblock = tempBuffer.some((text) => text.includes("\n"));
  if (isCodeblock) {
    buffer.push("\n```\n");
    buffer.push(tempBuffer.join(""));
    buffer.push("\n```\n");
  } else {
    buffer.push("`");
    let characterCount = 0;
    for (const tempItem of tempBuffer) {
      characterCount += tempItem.length;
      if (characterCount > LINE_MAX_LENGTH) {
        buffer.push("\n");
        characterCount = 0;
      }
      buffer.push(tempItem);
      buffer.push("`");
    }
  }
}
function collectNavigationLinks(tree) {
  const links = [];
  collectLinks(tree, links);
  return links;
}
function collectLinks(node, links) {
  const role = getNodeRole(node.node);
  if (role === "link" && isNavigationLink(node)) {
    const linkText = getNodeText(node.node, true);
    const url = getLinkUrl(node.node);
    const description = node.node.description?.value || "";
    links.push(`- [${linkText}](${url})${description ? " - " + description : ""}`);
  }
  for (const child of node.children) {
    collectLinks(child, links);
  }
}
export {
  convertAXTreeToMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvZWxlY3Ryb24tbWFpbi9jZHBBY2Nlc3NpYmlsaXR5RG9tYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8jcmVnaW9uIFR5cGVzXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQVhWYWx1ZSB7XG5cdHR5cGU6IEFYVmFsdWVUeXBlO1xuXHR2YWx1ZT86IHVua25vd247XG5cdHJlbGF0ZWROb2Rlcz86IEFYTm9kZVtdO1xuXHRzb3VyY2VzPzogQVhWYWx1ZVNvdXJjZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFYVmFsdWVTb3VyY2Uge1xuXHR0eXBlOiBBWFZhbHVlU291cmNlVHlwZTtcblx0dmFsdWU/OiBBWFZhbHVlO1xuXHRhdHRyaWJ1dGU/OiBzdHJpbmc7XG5cdGF0dHJpYnV0ZVZhbHVlPzogc3RyaW5nO1xuXHRzdXBlcnNlZGVkPzogYm9vbGVhbjtcblx0bmF0aXZlU291cmNlPzogQVhWYWx1ZU5hdGl2ZVNvdXJjZVR5cGU7XG5cdG5hdGl2ZVNvdXJjZVZhbHVlPzogc3RyaW5nO1xuXHRpbnZhbGlkPzogYm9vbGVhbjtcblx0aW52YWxpZFJlYXNvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBWE5vZGUge1xuXHRub2RlSWQ6IHN0cmluZztcblx0aWdub3JlZDogYm9vbGVhbjtcblx0aWdub3JlZFJlYXNvbnM/OiBBWFByb3BlcnR5W107XG5cdHJvbGU/OiBBWFZhbHVlO1xuXHRjaHJvbWVSb2xlPzogQVhWYWx1ZTtcblx0bmFtZT86IEFYVmFsdWU7XG5cdGRlc2NyaXB0aW9uPzogQVhWYWx1ZTtcblx0dmFsdWU/OiBBWFZhbHVlO1xuXHRwcm9wZXJ0aWVzPzogQVhQcm9wZXJ0eVtdO1xuXHRjaGlsZElkcz86IHN0cmluZ1tdO1xuXHRiYWNrZW5kRE9NTm9kZUlkPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFYUHJvcGVydHkge1xuXHRuYW1lOiBBWFByb3BlcnR5TmFtZTtcblx0dmFsdWU6IEFYVmFsdWU7XG59XG5cbmV4cG9ydCB0eXBlIEFYVmFsdWVUeXBlID0gJ2Jvb2xlYW4nIHwgJ3RyaXN0YXRlJyB8ICdib29sZWFuT3JVbmRlZmluZWQnIHwgJ2lkcmVmJyB8ICdpZHJlZkxpc3QnIHwgJ2ludGVnZXInIHwgJ25vZGUnIHwgJ25vZGVMaXN0JyB8ICdudW1iZXInIHwgJ3N0cmluZycgfCAnY29tcHV0ZWRTdHJpbmcnIHwgJ3Rva2VuJyB8ICd0b2tlbkxpc3QnIHwgJ2RvbVJlbGF0aW9uJyB8ICdyb2xlJyB8ICdpbnRlcm5hbFJvbGUnIHwgJ3ZhbHVlVW5kZWZpbmVkJztcblxuZXhwb3J0IHR5cGUgQVhWYWx1ZVNvdXJjZVR5cGUgPSAnYXR0cmlidXRlJyB8ICdpbXBsaWNpdCcgfCAnc3R5bGUnIHwgJ2NvbnRlbnRzJyB8ICdwbGFjZWhvbGRlcicgfCAncmVsYXRlZEVsZW1lbnQnO1xuXG5leHBvcnQgdHlwZSBBWFZhbHVlTmF0aXZlU291cmNlVHlwZSA9ICdkZXNjcmlwdGlvbicgfCAnZmlnY2FwdGlvbicgfCAnbGFiZWwnIHwgJ2xhYmVsZm9yJyB8ICdsYWJlbHdyYXBwZWQnIHwgJ2xlZ2VuZCcgfCAncnVieWFubm90YXRpb24nIHwgJ3RhYmxlY2FwdGlvbicgfCAndGl0bGUnIHwgJ290aGVyJztcblxuZXhwb3J0IHR5cGUgQVhQcm9wZXJ0eU5hbWUgPSAndXJsJyB8ICdidXN5JyB8ICdkaXNhYmxlZCcgfCAnZWRpdGFibGUnIHwgJ2ZvY3VzYWJsZScgfCAnZm9jdXNlZCcgfCAnaGlkZGVuJyB8ICdoaWRkZW5Sb290JyB8ICdpbnZhbGlkJyB8ICdrZXlzaG9ydGN1dHMnIHwgJ3NldHRhYmxlJyB8ICdyb2xlZGVzY3JpcHRpb24nIHwgJ2xpdmUnIHwgJ2F0b21pYycgfCAncmVsZXZhbnQnIHwgJ3Jvb3QnIHwgJ2F1dG9jb21wbGV0ZScgfCAnaGFzUG9wdXAnIHwgJ2xldmVsJyB8ICdtdWx0aXNlbGVjdGFibGUnIHwgJ29yaWVudGF0aW9uJyB8ICdtdWx0aWxpbmUnIHwgJ3JlYWRvbmx5JyB8ICdyZXF1aXJlZCcgfCAndmFsdWVtaW4nIHwgJ3ZhbHVlbWF4JyB8ICd2YWx1ZXRleHQnIHwgJ2NoZWNrZWQnIHwgJ2V4cGFuZGVkJyB8ICdwcmVzc2VkJyB8ICdzZWxlY3RlZCcgfCAnYWN0aXZlZGVzY2VuZGFudCcgfCAnY29udHJvbHMnIHwgJ2Rlc2NyaWJlZGJ5JyB8ICdkZXRhaWxzJyB8ICdlcnJvcm1lc3NhZ2UnIHwgJ2Zsb3d0bycgfCAnbGFiZWxsZWRieScgfCAnb3ducyc7XG5cbi8vI2VuZHJlZ2lvblxuXG5pbnRlcmZhY2UgQVhOb2RlVHJlZSB7XG5cdHJlYWRvbmx5IG5vZGU6IEFYTm9kZTtcblx0cmVhZG9ubHkgY2hpbGRyZW46IEFYTm9kZVRyZWVbXTtcblx0cGFyZW50OiBBWE5vZGVUcmVlIHwgbnVsbDtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgZm9yZXN0IG9mIG5vZGUgdHJlZXMgZnJvbSB0aGUgZ2l2ZW4gQVhOb2Rlcy5cbiAqIFdoZW4gbm9kZXMgY29tZSBmcm9tIG11bHRpcGxlIGZyYW1lcyAoZS5nLiwgbWFpbiBmcmFtZSArIGlmcmFtZXMpLFxuICogZWFjaCBmcmFtZSBoYXMgaXRzIG93biBSb290V2ViQXJlYSwgcmVzdWx0aW5nIGluIG11bHRpcGxlIHRyZWVzLlxuICovXG5mdW5jdGlvbiBjcmVhdGVOb2RlVHJlZXMobm9kZXM6IEFYTm9kZVtdKTogQVhOb2RlVHJlZVtdIHtcblx0aWYgKG5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8vIENyZWF0ZSBhIG1hcCBvZiBub2RlIElEcyB0byB0aGVpciBjb3JyZXNwb25kaW5nIG5vZGVzIGZvciBxdWljayBsb29rdXBcblx0Y29uc3Qgbm9kZUxvb2t1cCA9IG5ldyBNYXA8c3RyaW5nLCBBWE5vZGU+KCk7XG5cdGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuXHRcdG5vZGVMb29rdXAuc2V0KG5vZGUubm9kZUlkLCBub2RlKTtcblx0fVxuXG5cdC8vIEhlbHBlciBmdW5jdGlvbiB0byBnZXQgYWxsIG5vbi1pZ25vcmVkIGRlc2NlbmRhbnRzIG9mIGEgbm9kZVxuXHRmdW5jdGlvbiBnZXROb25JZ25vcmVkRGVzY2VuZGFudHMobm9kZUlkOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3Qgbm9kZSA9IG5vZGVMb29rdXAuZ2V0KG5vZGVJZCk7XG5cdFx0aWYgKCFub2RlIHx8ICFub2RlLmNoaWxkSWRzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGRJZCBvZiBub2RlLmNoaWxkSWRzKSB7XG5cdFx0XHRjb25zdCBjaGlsZE5vZGUgPSBub2RlTG9va3VwLmdldChjaGlsZElkKTtcblx0XHRcdGlmICghY2hpbGROb2RlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hpbGROb2RlLmlnbm9yZWQpIHtcblx0XHRcdFx0Ly8gSWYgY2hpbGQgaXMgaWdub3JlZCwgYWRkIGl0cyBub24taWdub3JlZCBkZXNjZW5kYW50cyBpbnN0ZWFkXG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmdldE5vbklnbm9yZWREZXNjZW5kYW50cyhjaGlsZElkKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBPdGhlcndpc2UsIGFkZCB0aGUgY2hpbGQgaXRzZWxmXG5cdFx0XHRcdHJlc3VsdC5wdXNoKGNoaWxkSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gQ3JlYXRlIHRyZWUgbm9kZXMgb25seSBmb3Igbm9uLWlnbm9yZWQgbm9kZXNcblx0Y29uc3Qgbm9kZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBBWE5vZGVUcmVlPigpO1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRpZiAoIW5vZGUuaWdub3JlZCkge1xuXHRcdFx0bm9kZU1hcC5zZXQobm9kZS5ub2RlSWQsIHsgbm9kZSwgY2hpbGRyZW46IFtdLCBwYXJlbnQ6IG51bGwgfSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRXN0YWJsaXNoIHBhcmVudC1jaGlsZCByZWxhdGlvbnNoaXBzLCBieXBhc3NpbmcgaWdub3JlZCBub2Rlc1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRpZiAobm9kZS5pZ25vcmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlTm9kZSA9IG5vZGVNYXAuZ2V0KG5vZGUubm9kZUlkKSE7XG5cdFx0aWYgKG5vZGUuY2hpbGRJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGRJZCBvZiBub2RlLmNoaWxkSWRzKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkTm9kZSA9IG5vZGVMb29rdXAuZ2V0KGNoaWxkSWQpO1xuXHRcdFx0XHRpZiAoIWNoaWxkTm9kZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNoaWxkTm9kZS5pZ25vcmVkKSB7XG5cdFx0XHRcdFx0Ly8gSWYgY2hpbGQgaXMgaWdub3JlZCwgY29ubmVjdCBpdHMgbm9uLWlnbm9yZWQgZGVzY2VuZGFudHMgdG8gdGhpcyBub2RlXG5cdFx0XHRcdFx0Y29uc3Qgbm9uSWdub3JlZERlc2NlbmRhbnRzID0gZ2V0Tm9uSWdub3JlZERlc2NlbmRhbnRzKGNoaWxkSWQpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGVzY2VuZGFudElkIG9mIG5vbklnbm9yZWREZXNjZW5kYW50cykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVzY2VuZGFudFRyZWVOb2RlID0gbm9kZU1hcC5nZXQoZGVzY2VuZGFudElkKTtcblx0XHRcdFx0XHRcdGlmIChkZXNjZW5kYW50VHJlZU5vZGUpIHtcblx0XHRcdFx0XHRcdFx0ZGVzY2VuZGFudFRyZWVOb2RlLnBhcmVudCA9IHRyZWVOb2RlO1xuXHRcdFx0XHRcdFx0XHR0cmVlTm9kZS5jaGlsZHJlbi5wdXNoKGRlc2NlbmRhbnRUcmVlTm9kZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE5vcm1hbCBjYXNlOiBhZGQgbm9uLWlnbm9yZWQgY2hpbGQgZGlyZWN0bHlcblx0XHRcdFx0XHRjb25zdCBjaGlsZFRyZWVOb2RlID0gbm9kZU1hcC5nZXQoY2hpbGRJZCk7XG5cdFx0XHRcdFx0aWYgKGNoaWxkVHJlZU5vZGUpIHtcblx0XHRcdFx0XHRcdGNoaWxkVHJlZU5vZGUucGFyZW50ID0gdHJlZU5vZGU7XG5cdFx0XHRcdFx0XHR0cmVlTm9kZS5jaGlsZHJlbi5wdXNoKGNoaWxkVHJlZU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEZpbmQgYWxsIHJvb3Qgbm9kZXMgKG5vZGVzIHdpdGhvdXQgYSBwYXJlbnQpXG5cdC8vIFdoZW4gbm9kZXMgY29tZSBmcm9tIG11bHRpcGxlIGZyYW1lcywgZWFjaCBmcmFtZSBoYXMgaXRzIG93biByb290XG5cdGNvbnN0IHJvb3RzOiBBWE5vZGVUcmVlW10gPSBbXTtcblx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVNYXAudmFsdWVzKCkpIHtcblx0XHRpZiAoIW5vZGUucGFyZW50KSB7XG5cdFx0XHRyb290cy5wdXNoKG5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByb290cztcbn1cblxuLyoqXG4gKiBXaGVuIHBvc3NpYmxlLCB3ZSB3aWxsIG1ha2Ugc3VyZSBsaW5lcyBhcmUgbm8gbG9uZ2VyIHRoYW4gODAuIFRoaXMgaXMgdG8gaGVscFxuICogY2VydGFpbiBwaWVjZXMgb2Ygc29mdHdhcmUgdGhhdCBjYW4ndCBoYW5kbGUgbG9uZyBsaW5lcy5cbiAqL1xuY29uc3QgTElORV9NQVhfTEVOR1RIID0gODA7XG5cbi8qKlxuICogQ29udmVydHMgYW4gYWNjZXNzaWJpbGl0eSB0cmVlIHJlcHJlc2VudGVkIGJ5IEFYTm9kZSBvYmplY3RzIGludG8gYSBtYXJrZG93biBzdHJpbmcuXG4gKiBIYW5kbGVzIG11bHRpcGxlIHJvb3Qgbm9kZXMgKGUuZy4sIGZyb20gbWFpbiBmcmFtZSArIGlmcmFtZXMpIGJ5IHByb2Nlc3NpbmcgZWFjaCB0cmVlXG4gKiBhbmQgY29tYmluaW5nIHRoZSByZXN1bHRzLlxuICpcbiAqIEBwYXJhbSB1cmkgVGhlIFVSSSBvZiB0aGUgZG9jdW1lbnRcbiAqIEBwYXJhbSBheE5vZGVzIFRoZSBhcnJheSBvZiBBWE5vZGUgb2JqZWN0cyByZXByZXNlbnRpbmcgdGhlIGFjY2Vzc2liaWxpdHkgdHJlZVxuICogQHJldHVybnMgQSBtYXJrZG93biByZXByZXNlbnRhdGlvbiBvZiB0aGUgYWNjZXNzaWJpbGl0eSB0cmVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih1cmk6IFVSSSwgYXhOb2RlczogQVhOb2RlW10pOiBzdHJpbmcge1xuXHRjb25zdCB0cmVlcyA9IGNyZWF0ZU5vZGVUcmVlcyhheE5vZGVzKTtcblx0aWYgKHRyZWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAnJzsgLy8gUmV0dXJuIGVtcHR5IHN0cmluZyBmb3IgZW1wdHkgdHJlZVxuXHR9XG5cblx0Ly8gUHJvY2VzcyBlYWNoIHRyZWUgYW5kIGNvbGxlY3QgbWFpbiBjb250ZW50IGFuZCBuYXZpZ2F0aW9uIGxpbmtzXG5cdGNvbnN0IGFsbE1haW5Db250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBhbGxOYXZMaW5rczogc3RyaW5nW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IHRyZWUgb2YgdHJlZXMpIHtcblx0XHRjb25zdCBtYWluQ29udGVudCA9IGV4dHJhY3RNYWluQ29udGVudCh1cmksIHRyZWUpO1xuXHRcdGNvbnN0IG5hdkxpbmtzID0gY29sbGVjdE5hdmlnYXRpb25MaW5rcyh0cmVlKTtcblxuXHRcdGlmIChtYWluQ29udGVudC50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0YWxsTWFpbkNvbnRlbnQucHVzaChtYWluQ29udGVudCk7XG5cdFx0fVxuXHRcdGFsbE5hdkxpbmtzLnB1c2goLi4ubmF2TGlua3MpO1xuXHR9XG5cblx0Ly8gQ29tYmluZSBhbGwgbWFpbiBjb250ZW50IGZyb20gYWxsIHRyZWVzXG5cdGNvbnN0IGNvbWJpbmVkTWFpbkNvbnRlbnQgPSBhbGxNYWluQ29udGVudC5qb2luKCdcXG5cXG4nKTtcblxuXHQvLyBDb21iaW5lIG1haW4gY29udGVudCBhbmQgbmF2aWdhdGlvbiBsaW5rc1xuXHRyZXR1cm4gY29tYmluZWRNYWluQ29udGVudCArIChhbGxOYXZMaW5rcy5sZW5ndGggPiAwID8gJ1xcblxcbiMjIEFkZGl0aW9uYWwgTGlua3NcXG4nICsgYWxsTmF2TGlua3Muam9pbignXFxuJykgOiAnJyk7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RNYWluQ29udGVudCh1cmk6IFVSSSwgdHJlZTogQVhOb2RlVHJlZSk6IHN0cmluZyB7XG5cdGNvbnN0IGNvbnRlbnRCdWZmZXI6IHN0cmluZ1tdID0gW107XG5cdHByb2Nlc3NOb2RlKHVyaSwgdHJlZSwgY29udGVudEJ1ZmZlciwgMCwgdHJ1ZSk7XG5cdHJldHVybiBjb250ZW50QnVmZmVyLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzTm9kZSh1cmk6IFVSSSwgbm9kZTogQVhOb2RlVHJlZSwgYnVmZmVyOiBzdHJpbmdbXSwgZGVwdGg6IG51bWJlciwgYWxsb3dXcmFwOiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IHJvbGUgPSBnZXROb2RlUm9sZShub2RlLm5vZGUpO1xuXG5cdHN3aXRjaCAocm9sZSkge1xuXHRcdGNhc2UgJ25hdmlnYXRpb24nOlxuXHRcdFx0cmV0dXJuOyAvLyBTa2lwIG5hdmlnYXRpb24gbm9kZXNcblxuXHRcdGNhc2UgJ2hlYWRpbmcnOlxuXHRcdFx0cHJvY2Vzc0hlYWRpbmdOb2RlKHVyaSwgbm9kZSwgYnVmZmVyLCBkZXB0aCk7XG5cdFx0XHRyZXR1cm47XG5cblx0XHRjYXNlICdwYXJhZ3JhcGgnOlxuXHRcdFx0cHJvY2Vzc1BhcmFncmFwaE5vZGUodXJpLCBub2RlLCBidWZmZXIsIGRlcHRoLCBhbGxvd1dyYXApO1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Y2FzZSAnbGlzdCc6XG5cdFx0XHRidWZmZXIucHVzaCgnXFxuJyk7XG5cdFx0XHRmb3IgKGNvbnN0IGRlc2NDaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdHByb2Nlc3NOb2RlKHVyaSwgZGVzY0NoaWxkLCBidWZmZXIsIGRlcHRoICsgMSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRidWZmZXIucHVzaCgnXFxuJyk7XG5cdFx0XHRyZXR1cm47XG5cblx0XHRjYXNlICdMaXN0TWFya2VyJzpcblx0XHRcdC8vIFRPRE86IFNob3VsZCB3ZSBub3JtYWxpemUgdGhlc2UgTGlzdE1hcmtlcnMgdG8gYC1gIGFuZCBub3JtYWwgbGlzdHM/XG5cdFx0XHRidWZmZXIucHVzaChnZXROb2RlVGV4dChub2RlLm5vZGUsIGFsbG93V3JhcCkpO1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Y2FzZSAnbGlzdGl0ZW0nOiB7XG5cdFx0XHRjb25zdCB0ZW1wQnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Ly8gUHJvY2VzcyB0aGUgY2hpbGRyZW4gb2YgdGhlIGxpc3QgaXRlbVxuXHRcdFx0Zm9yIChjb25zdCBkZXNjQ2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRwcm9jZXNzTm9kZSh1cmksIGRlc2NDaGlsZCwgdGVtcEJ1ZmZlciwgZGVwdGggKyAxLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluZGVudCA9IGdldExldmVsKG5vZGUubm9kZSkgPiAxID8gJyAnLnJlcGVhdChnZXRMZXZlbChub2RlLm5vZGUpKSA6ICcnO1xuXHRcdFx0YnVmZmVyLnB1c2goYCR7aW5kZW50fSR7dGVtcEJ1ZmZlci5qb2luKCcnKS50cmltKCl9XFxuYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2FzZSAnbGluayc6XG5cdFx0XHRpZiAoIWlzTmF2aWdhdGlvbkxpbmsobm9kZSkpIHtcblx0XHRcdFx0Y29uc3QgbGlua1RleHQgPSBnZXROb2RlVGV4dChub2RlLm5vZGUsIGFsbG93V3JhcCk7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldExpbmtVcmwobm9kZS5ub2RlKTtcblx0XHRcdFx0aWYgKCFpc1NhbWVVcmlJZ25vcmluZ1F1ZXJ5QW5kRnJhZ21lbnQodXJpLCBub2RlLm5vZGUpKSB7XG5cdFx0XHRcdFx0YnVmZmVyLnB1c2goYFske2xpbmtUZXh0fV0oJHt1cmx9KWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1ZmZlci5wdXNoKGxpbmtUZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdGNhc2UgJ1N0YXRpY1RleHQnOiB7XG5cdFx0XHRjb25zdCBzdGF0aWNUZXh0ID0gZ2V0Tm9kZVRleHQobm9kZS5ub2RlLCBhbGxvd1dyYXApO1xuXHRcdFx0aWYgKHN0YXRpY1RleHQpIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goc3RhdGljVGV4dCk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y2FzZSAnaW1hZ2UnOiB7XG5cdFx0XHRjb25zdCBhbHRUZXh0ID0gZ2V0Tm9kZVRleHQobm9kZS5ub2RlLCBhbGxvd1dyYXApIHx8ICdJbWFnZSc7XG5cdFx0XHRjb25zdCBpbWFnZVVybCA9IGdldEltYWdlVXJsKG5vZGUubm9kZSk7XG5cdFx0XHRpZiAoaW1hZ2VVcmwpIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goYCFbJHthbHRUZXh0fV0oJHtpbWFnZVVybH0pXFxuXFxuYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidWZmZXIucHVzaChgW0ltYWdlOiAke2FsdFRleHR9XVxcblxcbmApO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y2FzZSAnRGVzY3JpcHRpb25MaXN0Jzpcblx0XHRcdHByb2Nlc3NEZXNjcmlwdGlvbkxpc3ROb2RlKHVyaSwgbm9kZSwgYnVmZmVyLCBkZXB0aCk7XG5cdFx0XHRyZXR1cm47XG5cblx0XHRjYXNlICdibG9ja3F1b3RlJzpcblx0XHRcdGJ1ZmZlci5wdXNoKCc+ICcgKyBnZXROb2RlVGV4dChub2RlLm5vZGUsIGFsbG93V3JhcCkucmVwbGFjZSgvXFxuL2csICdcXG4+ICcpICsgJ1xcblxcbicpO1xuXHRcdFx0YnJlYWs7XG5cblx0XHQvLyBUT0RPOiBJcyB0aGlzIHRoZSBjb3JyZWN0IHdheSB0byBoYW5kbGUgdGhlIGdlbmVyaWMgcm9sZT9cblx0XHRjYXNlICdnZW5lcmljJzpcblx0XHRcdGJ1ZmZlci5wdXNoKCcgJyk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgJ2NvZGUnOiB7XG5cdFx0XHRwcm9jZXNzQ29kZU5vZGUodXJpLCBub2RlLCBidWZmZXIsIGRlcHRoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjYXNlICdwcmUnOlxuXHRcdFx0YnVmZmVyLnB1c2goJ2BgYFxcbicgKyBnZXROb2RlVGV4dChub2RlLm5vZGUsIGZhbHNlKSArICdcXG5gYGBcXG5cXG4nKTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSAndGFibGUnOlxuXHRcdFx0cHJvY2Vzc1RhYmxlTm9kZShub2RlLCBidWZmZXIpO1xuXHRcdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gUHJvY2VzcyBjaGlsZHJlbiBpZiBub3QgYWxyZWFkeSBoYW5kbGVkIGluIHNwZWNpZmljIGNhc2VzXG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdHByb2Nlc3NOb2RlKHVyaSwgY2hpbGQsIGJ1ZmZlciwgZGVwdGggKyAxLCBhbGxvd1dyYXApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVSb2xlKG5vZGU6IEFYTm9kZSk6IHN0cmluZyB7XG5cdHJldHVybiBub2RlLnJvbGU/LnZhbHVlIGFzIHN0cmluZyB8fCAnJztcbn1cblxuZnVuY3Rpb24gZ2V0Tm9kZVRleHQobm9kZTogQVhOb2RlLCBhbGxvd1dyYXA6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRjb25zdCB0ZXh0ID0gbm9kZS5uYW1lPy52YWx1ZSBhcyBzdHJpbmcgfHwgbm9kZS52YWx1ZT8udmFsdWUgYXMgc3RyaW5nIHx8ICcnO1xuXHRpZiAoIWFsbG93V3JhcCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0aWYgKHRleHQubGVuZ3RoIDw9IExJTkVfTUFYX0xFTkdUSCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0Y29uc3QgY2hhcnMgPSB0ZXh0LnNwbGl0KCcnKTtcblx0bGV0IGxhc3RTcGFjZUluZGV4ID0gLTE7XG5cdGZvciAobGV0IGkgPSAxOyBpIDwgY2hhcnMubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAoY2hhcnNbaV0gPT09ICcgJykge1xuXHRcdFx0bGFzdFNwYWNlSW5kZXggPSBpO1xuXHRcdH1cblx0XHQvLyBDaGVjayBpZiB3ZSByZWFjaGVkIHRoZSBsaW5lIG1heCBsZW5ndGgsIHRyeSB0byBicmVhayBhdCB0aGUgbGFzdCBzcGFjZVxuXHRcdC8vIGJlZm9yZSB0aGUgbGluZSBtYXggbGVuZ3RoXG5cdFx0aWYgKGkgJSBMSU5FX01BWF9MRU5HVEggPT09IDAgJiYgbGFzdFNwYWNlSW5kZXggIT09IC0xKSB7XG5cdFx0XHQvLyByZXBsYWNlIHRoZSBzcGFjZSB3aXRoIGEgbmV3IGxpbmVcblx0XHRcdGNoYXJzW2xhc3RTcGFjZUluZGV4XSA9ICdcXG4nO1xuXHRcdFx0bGFzdFNwYWNlSW5kZXggPSBpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY2hhcnMuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGdldExldmVsKG5vZGU6IEFYTm9kZSk6IG51bWJlciB7XG5cdGNvbnN0IGxldmVsUHJvcCA9IG5vZGUucHJvcGVydGllcz8uZmluZChwID0+IHAubmFtZSA9PT0gJ2xldmVsJyk7XG5cdHJldHVybiBsZXZlbFByb3AgPyBNYXRoLm1pbihOdW1iZXIobGV2ZWxQcm9wLnZhbHVlLnZhbHVlKSB8fCAxLCA2KSA6IDE7XG59XG5cbmZ1bmN0aW9uIGdldExpbmtVcmwobm9kZTogQVhOb2RlKTogc3RyaW5nIHtcblx0Ly8gRmluZCBVUkwgaW4gcHJvcGVydGllc1xuXHRjb25zdCB1cmxQcm9wID0gbm9kZS5wcm9wZXJ0aWVzPy5maW5kKHAgPT4gcC5uYW1lID09PSAndXJsJyk7XG5cdHJldHVybiB1cmxQcm9wPy52YWx1ZS52YWx1ZSBhcyBzdHJpbmcgfHwgJyMnO1xufVxuXG5mdW5jdGlvbiBnZXRJbWFnZVVybChub2RlOiBBWE5vZGUpOiBzdHJpbmcgfCBudWxsIHtcblx0Ly8gRmluZCBVUkwgaW4gcHJvcGVydGllc1xuXHRjb25zdCB1cmxQcm9wID0gbm9kZS5wcm9wZXJ0aWVzPy5maW5kKHAgPT4gcC5uYW1lID09PSAndXJsJyk7XG5cdHJldHVybiB1cmxQcm9wPy52YWx1ZS52YWx1ZSBhcyBzdHJpbmcgfHwgbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNOYXZpZ2F0aW9uTGluayhub2RlOiBBWE5vZGVUcmVlKTogYm9vbGVhbiB7XG5cdC8vIENoZWNrIGlmIHRoaXMgbGluayBpcyBwYXJ0IG9mIG5hdmlnYXRpb25cblx0bGV0IGN1cnJlbnQ6IEFYTm9kZVRyZWUgfCBudWxsID0gbm9kZTtcblx0d2hpbGUgKGN1cnJlbnQpIHtcblx0XHRjb25zdCByb2xlID0gZ2V0Tm9kZVJvbGUoY3VycmVudC5ub2RlKTtcblx0XHRpZiAoWyduYXZpZ2F0aW9uJywgJ21lbnUnLCAnbWVudWJhciddLmluY2x1ZGVzKHJvbGUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y3VycmVudCA9IGN1cnJlbnQucGFyZW50O1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaXNTYW1lVXJpSWdub3JpbmdRdWVyeUFuZEZyYWdtZW50KHVyaTogVVJJLCBub2RlOiBBWE5vZGUpOiBib29sZWFuIHtcblx0Ly8gQ2hlY2sgaWYgdGhpcyBsaW5rIGlzIGFuIGFuY2hvciBsaW5rXG5cdGNvbnN0IGxpbmsgPSBnZXRMaW5rVXJsKG5vZGUpO1xuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IFVSSS5wYXJzZShsaW5rKTtcblx0XHRyZXR1cm4gcGFyc2VkLnNjaGVtZSA9PT0gdXJpLnNjaGVtZSAmJiBwYXJzZWQuYXV0aG9yaXR5ID09PSB1cmkuYXV0aG9yaXR5ICYmIHBhcnNlZC5wYXRoID09PSB1cmkucGF0aDtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBwcm9jZXNzUGFyYWdyYXBoTm9kZSh1cmk6IFVSSSwgbm9kZTogQVhOb2RlVHJlZSwgYnVmZmVyOiBzdHJpbmdbXSwgZGVwdGg6IG51bWJlciwgYWxsb3dXcmFwOiBib29sZWFuKTogdm9pZCB7XG5cdGJ1ZmZlci5wdXNoKCdcXG4nKTtcblx0Ly8gUHJvY2VzcyB0aGUgY2hpbGRyZW4gb2YgdGhlIHBhcmFncmFwaFxuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRwcm9jZXNzTm9kZSh1cmksIGNoaWxkLCBidWZmZXIsIGRlcHRoICsgMSwgYWxsb3dXcmFwKTtcblx0fVxuXHRidWZmZXIucHVzaCgnXFxuXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NIZWFkaW5nTm9kZSh1cmk6IFVSSSwgbm9kZTogQVhOb2RlVHJlZSwgYnVmZmVyOiBzdHJpbmdbXSwgZGVwdGg6IG51bWJlcik6IHZvaWQge1xuXHRidWZmZXIucHVzaCgnXFxuJyk7XG5cdGNvbnN0IGxldmVsID0gZ2V0TGV2ZWwobm9kZS5ub2RlKTtcblx0YnVmZmVyLnB1c2goYCR7JyMnLnJlcGVhdChsZXZlbCl9IGApO1xuXHQvLyBQcm9jZXNzIGNoaWxkcmVuIG5vZGVzIG9mIHRoZSBoZWFkaW5nXG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdGlmIChnZXROb2RlUm9sZShjaGlsZC5ub2RlKSA9PT0gJ1N0YXRpY1RleHQnKSB7XG5cdFx0XHRidWZmZXIucHVzaChnZXROb2RlVGV4dChjaGlsZC5ub2RlLCBmYWxzZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcm9jZXNzTm9kZSh1cmksIGNoaWxkLCBidWZmZXIsIGRlcHRoICsgMSwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXHRidWZmZXIucHVzaCgnXFxuXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NEZXNjcmlwdGlvbkxpc3ROb2RlKHVyaTogVVJJLCBub2RlOiBBWE5vZGVUcmVlLCBidWZmZXI6IHN0cmluZ1tdLCBkZXB0aDogbnVtYmVyKTogdm9pZCB7XG5cdGJ1ZmZlci5wdXNoKCdcXG4nKTtcblxuXHQvLyBQcm9jZXNzIGVhY2ggY2hpbGQgb2YgdGhlIGRlc2NyaXB0aW9uIGxpc3Rcblx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0aWYgKGdldE5vZGVSb2xlKGNoaWxkLm5vZGUpID09PSAndGVybScpIHtcblx0XHRcdGJ1ZmZlci5wdXNoKCctICoqJyk7XG5cdFx0XHQvLyBQcm9jZXNzIHRlcm0gbm9kZXNcblx0XHRcdGZvciAoY29uc3QgdGVybUNoaWxkIG9mIGNoaWxkLmNoaWxkcmVuKSB7XG5cdFx0XHRcdHByb2Nlc3NOb2RlKHVyaSwgdGVybUNoaWxkLCBidWZmZXIsIGRlcHRoICsgMSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRidWZmZXIucHVzaCgnKiogJyk7XG5cdFx0fSBlbHNlIGlmIChnZXROb2RlUm9sZShjaGlsZC5ub2RlKSA9PT0gJ2RlZmluaXRpb24nKSB7XG5cdFx0XHQvLyBQcm9jZXNzIGRlc2NyaXB0aW9uIG5vZGVzXG5cdFx0XHRmb3IgKGNvbnN0IGRlc2NDaGlsZCBvZiBjaGlsZC5jaGlsZHJlbikge1xuXHRcdFx0XHRwcm9jZXNzTm9kZSh1cmksIGRlc2NDaGlsZCwgYnVmZmVyLCBkZXB0aCArIDEsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0YnVmZmVyLnB1c2goJ1xcbicpO1xuXHRcdH1cblx0fVxuXG5cdGJ1ZmZlci5wdXNoKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gaXNUYWJsZUNlbGwocm9sZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdC8vIE1hdGNoIGNlbGwsIGdyaWRjZWxsLCBjb2x1bW5oZWFkZXIsIHJvd2hlYWRlciByb2xlc1xuXHRyZXR1cm4gcm9sZSA9PT0gJ2NlbGwnIHx8IHJvbGUgPT09ICdncmlkY2VsbCcgfHwgcm9sZSA9PT0gJ2NvbHVtbmhlYWRlcicgfHwgcm9sZSA9PT0gJ3Jvd2hlYWRlcic7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NUYWJsZU5vZGUobm9kZTogQVhOb2RlVHJlZSwgYnVmZmVyOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRidWZmZXIucHVzaCgnXFxuJyk7XG5cblx0Ly8gRmluZCByb3dzXG5cdGNvbnN0IHJvd3MgPSBub2RlLmNoaWxkcmVuLmZpbHRlcihjaGlsZCA9PiBnZXROb2RlUm9sZShjaGlsZC5ub2RlKS5pbmNsdWRlcygncm93JykpO1xuXG5cdGlmIChyb3dzLmxlbmd0aCA+IDApIHtcblx0XHQvLyBGaXJzdCByb3cgYXMgaGVhZGVyXG5cdFx0Y29uc3QgaGVhZGVyQ2VsbHMgPSByb3dzWzBdLmNoaWxkcmVuLmZpbHRlcihjZWxsID0+IGlzVGFibGVDZWxsKGdldE5vZGVSb2xlKGNlbGwubm9kZSkpKTtcblxuXHRcdC8vIEdlbmVyYXRlIGhlYWRlciByb3dcblx0XHRjb25zdCBoZWFkZXJDb250ZW50ID0gaGVhZGVyQ2VsbHMubWFwKGNlbGwgPT4gZ2V0Tm9kZVRleHQoY2VsbC5ub2RlLCBmYWxzZSkgfHwgJyAnKTtcblx0XHRidWZmZXIucHVzaCgnfCAnICsgaGVhZGVyQ29udGVudC5qb2luKCcgfCAnKSArICcgfFxcbicpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgc2VwYXJhdG9yIHJvd1xuXHRcdGJ1ZmZlci5wdXNoKCd8ICcgKyBoZWFkZXJDZWxscy5tYXAoKCkgPT4gJy0tLScpLmpvaW4oJyB8ICcpICsgJyB8XFxuJyk7XG5cblx0XHQvLyBHZW5lcmF0ZSBkYXRhIHJvd3Ncblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGRhdGFDZWxscyA9IHJvd3NbaV0uY2hpbGRyZW4uZmlsdGVyKGNlbGwgPT4gaXNUYWJsZUNlbGwoZ2V0Tm9kZVJvbGUoY2VsbC5ub2RlKSkpO1xuXHRcdFx0Y29uc3Qgcm93Q29udGVudCA9IGRhdGFDZWxscy5tYXAoY2VsbCA9PiBnZXROb2RlVGV4dChjZWxsLm5vZGUsIGZhbHNlKSB8fCAnICcpO1xuXHRcdFx0YnVmZmVyLnB1c2goJ3wgJyArIHJvd0NvbnRlbnQuam9pbignIHwgJykgKyAnIHxcXG4nKTtcblx0XHR9XG5cdH1cblxuXHRidWZmZXIucHVzaCgnXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NDb2RlTm9kZSh1cmk6IFVSSSwgbm9kZTogQVhOb2RlVHJlZSwgYnVmZmVyOiBzdHJpbmdbXSwgZGVwdGg6IG51bWJlcik6IHZvaWQge1xuXHRjb25zdCB0ZW1wQnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuXHQvLyBQcm9jZXNzIHRoZSBjaGlsZHJlbiBvZiB0aGUgY29kZSBub2RlXG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdHByb2Nlc3NOb2RlKHVyaSwgY2hpbGQsIHRlbXBCdWZmZXIsIGRlcHRoICsgMSwgZmFsc2UpO1xuXHR9XG5cdGNvbnN0IGlzQ29kZWJsb2NrID0gdGVtcEJ1ZmZlci5zb21lKHRleHQgPT4gdGV4dC5pbmNsdWRlcygnXFxuJykpO1xuXHRpZiAoaXNDb2RlYmxvY2spIHtcblx0XHRidWZmZXIucHVzaCgnXFxuYGBgXFxuJyk7XG5cdFx0Ly8gQXBwZW5kIHRoZSBwcm9jZXNzZWQgdGV4dCB0byB0aGUgYnVmZmVyXG5cdFx0YnVmZmVyLnB1c2godGVtcEJ1ZmZlci5qb2luKCcnKSk7XG5cdFx0YnVmZmVyLnB1c2goJ1xcbmBgYFxcbicpO1xuXHR9IGVsc2Uge1xuXHRcdGJ1ZmZlci5wdXNoKCdgJyk7XG5cdFx0bGV0IGNoYXJhY3RlckNvdW50ID0gMDtcblx0XHQvLyBBcHBlbmQgdGhlIHByb2Nlc3NlZCB0ZXh0IHRvIHRoZSBidWZmZXJcblx0XHRmb3IgKGNvbnN0IHRlbXBJdGVtIG9mIHRlbXBCdWZmZXIpIHtcblx0XHRcdGNoYXJhY3RlckNvdW50ICs9IHRlbXBJdGVtLmxlbmd0aDtcblx0XHRcdGlmIChjaGFyYWN0ZXJDb3VudCA+IExJTkVfTUFYX0xFTkdUSCkge1xuXHRcdFx0XHRidWZmZXIucHVzaCgnXFxuJyk7XG5cdFx0XHRcdGNoYXJhY3RlckNvdW50ID0gMDtcblx0XHRcdH1cblx0XHRcdGJ1ZmZlci5wdXNoKHRlbXBJdGVtKTtcblx0XHRcdGJ1ZmZlci5wdXNoKCdgJyk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3ROYXZpZ2F0aW9uTGlua3ModHJlZTogQVhOb2RlVHJlZSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgbGlua3M6IHN0cmluZ1tdID0gW107XG5cdGNvbGxlY3RMaW5rcyh0cmVlLCBsaW5rcyk7XG5cdHJldHVybiBsaW5rcztcbn1cblxuZnVuY3Rpb24gY29sbGVjdExpbmtzKG5vZGU6IEFYTm9kZVRyZWUsIGxpbmtzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRjb25zdCByb2xlID0gZ2V0Tm9kZVJvbGUobm9kZS5ub2RlKTtcblxuXHRpZiAocm9sZSA9PT0gJ2xpbmsnICYmIGlzTmF2aWdhdGlvbkxpbmsobm9kZSkpIHtcblx0XHRjb25zdCBsaW5rVGV4dCA9IGdldE5vZGVUZXh0KG5vZGUubm9kZSwgdHJ1ZSk7XG5cdFx0Y29uc3QgdXJsID0gZ2V0TGlua1VybChub2RlLm5vZGUpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbm9kZS5ub2RlLmRlc2NyaXB0aW9uPy52YWx1ZSBhcyBzdHJpbmcgfHwgJyc7XG5cblx0XHRsaW5rcy5wdXNoKGAtIFske2xpbmtUZXh0fV0oJHt1cmx9KSR7ZGVzY3JpcHRpb24gPyAnIC0gJyArIGRlc2NyaXB0aW9uIDogJyd9YCk7XG5cdH1cblxuXHQvLyBQcm9jZXNzIGNoaWxkcmVuXG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdGNvbGxlY3RMaW5rcyhjaGlsZCwgbGlua3MpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLFdBQVc7QUE2RHBCLFNBQVMsZ0JBQWdCLE9BQStCO0FBQ3ZELE1BQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUdBLFFBQU0sYUFBYSxvQkFBSSxJQUFvQjtBQUMzQyxhQUFXLFFBQVEsT0FBTztBQUN6QixlQUFXLElBQUksS0FBSyxRQUFRLElBQUk7QUFBQSxFQUNqQztBQUdBLFdBQVMseUJBQXlCLFFBQTBCO0FBQzNELFVBQU0sT0FBTyxXQUFXLElBQUksTUFBTTtBQUNsQyxRQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssVUFB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YSxVQUFVLElBQUksVUFBUSxZQUFZLEtBQUssTUFBTSxLQUFLLEtBQUssR0FBRztBQUM3RSxhQUFPLEtBQUssT0FBTyxXQUFXLEtBQUssS0FBSyxJQUFJLE1BQU07QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPLEtBQUssSUFBSTtBQUNqQjtBQUVBLFNBQVMsZ0JBQWdCLEtBQVUsTUFBa0IsUUFBa0IsT0FBcUI7QUFDM0YsUUFBTSxhQUF1QixDQUFDO0FBRTlCLGFBQVcsU0FBUyxLQUFLLFVBQVU7QUFDbEMsZ0JBQVksS0FBSyxPQUFPLFlBQVksUUFBUSxHQUFHLEtBQUs7QUFBQSxFQUNyRDtBQUNBLFFBQU0sY0FBYyxXQUFXLEtBQUssVUFBUSxLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQy9ELE1BQUksYUFBYTtBQUNoQixXQUFPLEtBQUssU0FBUztBQUVyQixXQUFPLEtBQUssV0FBVyxLQUFLLEVBQUUsQ0FBQztBQUMvQixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCLE9BQU87QUFDTixXQUFPLEtBQUssR0FBRztBQUNmLFFBQUksaUJBQWlCO0FBRXJCLGVBQVcsWUFBWSxZQUFZO0FBQ2xDLHdCQUFrQixTQUFTO0FBQzNCLFVBQUksaUJBQWlCLGlCQUFpQjtBQUNyQyxlQUFPLEtBQUssSUFBSTtBQUNoQix5QkFBaUI7QUFBQSxNQUNsQjtBQUNBLGFBQU8sS0FBSyxRQUFRO0FBQ3BCLGFBQU8sS0FBSyxHQUFHO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLHVCQUF1QixNQUE0QjtBQUMzRCxRQUFNLFFBQWtCLENBQUM7QUFDekIsZUFBYSxNQUFNLEtBQUs7QUFDeEIsU0FBTztBQUNSO0FBRUEsU0FBUyxhQUFhLE1BQWtCLE9BQXVCO0FBQzlELFFBQU0sT0FBTyxZQUFZLEtBQUssSUFBSTtBQUVsQyxNQUFJLFNBQVMsVUFBVSxpQkFBaUIsSUFBSSxHQUFHO0FBQzlDLFVBQU0sV0FBVyxZQUFZLEtBQUssTUFBTSxJQUFJO0FBQzVDLFVBQU0sTUFBTSxXQUFXLEtBQUssSUFBSTtBQUNoQyxVQUFNLGNBQWMsS0FBSyxLQUFLLGFBQWEsU0FBbUI7QUFFOUQsVUFBTSxLQUFLLE1BQU0sUUFBUSxLQUFLLEdBQUcsSUFBSSxjQUFjLFFBQVEsY0FBYyxFQUFFLEVBQUU7QUFBQSxFQUM5RTtBQUdBLGFBQVcsU0FBUyxLQUFLLFVBQVU7QUFDbEMsaUJBQWEsT0FBTyxLQUFLO0FBQUEsRUFDMUI7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
