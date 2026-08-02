function createMatchers(selector, matchesName, results) {
  const tokenizer = newTokenizer(selector);
  let token = tokenizer.next();
  while (token !== null) {
    let priority = 0;
    if (token.length === 2 && token.charAt(1) === ":") {
      switch (token.charAt(0)) {
        case "R":
          priority = 1;
          break;
        case "L":
          priority = -1;
          break;
        default:
          console.log(`Unknown priority ${token} in scope selector`);
      }
      token = tokenizer.next();
    }
    const matcher = parseConjunction();
    if (matcher) {
      results.push({ matcher, priority });
    }
    if (token !== ",") {
      break;
    }
    token = tokenizer.next();
  }
  function parseOperand() {
    if (token === "-") {
      token = tokenizer.next();
      const expressionToNegate = parseOperand();
      if (!expressionToNegate) {
        return null;
      }
      return (matcherInput) => {
        const score = expressionToNegate(matcherInput);
        return score < 0 ? 0 : -1;
      };
    }
    if (token === "(") {
      token = tokenizer.next();
      const expressionInParents = parseInnerExpression();
      if (token === ")") {
        token = tokenizer.next();
      }
      return expressionInParents;
    }
    if (isIdentifier(token)) {
      const identifiers = [];
      do {
        identifiers.push(token);
        token = tokenizer.next();
      } while (isIdentifier(token));
      return (matcherInput) => matchesName(identifiers, matcherInput);
    }
    return null;
  }
  function parseConjunction() {
    let matcher = parseOperand();
    if (!matcher) {
      return null;
    }
    const matchers = [];
    while (matcher) {
      matchers.push(matcher);
      matcher = parseOperand();
    }
    return (matcherInput) => {
      let min = matchers[0](matcherInput);
      for (let i = 1; min >= 0 && i < matchers.length; i++) {
        min = Math.min(min, matchers[i](matcherInput));
      }
      return min;
    };
  }
  function parseInnerExpression() {
    let matcher = parseConjunction();
    if (!matcher) {
      return null;
    }
    const matchers = [];
    while (matcher) {
      matchers.push(matcher);
      if (token === "|" || token === ",") {
        do {
          token = tokenizer.next();
        } while (token === "|" || token === ",");
      } else {
        break;
      }
      matcher = parseConjunction();
    }
    return (matcherInput) => {
      let max = matchers[0](matcherInput);
      for (let i = 1; i < matchers.length; i++) {
        max = Math.max(max, matchers[i](matcherInput));
      }
      return max;
    };
  }
}
function isIdentifier(token) {
  return !!token && !!token.match(/[\w\.:]+/);
}
function newTokenizer(input) {
  const regex = /([LR]:|[\w\.:][\w\.:\-]*|[\,\|\-\(\)])/g;
  let match = regex.exec(input);
  return {
    next: () => {
      if (!match) {
        return null;
      }
      const res = match[0];
      match = regex.exec(input);
      return res;
    }
  };
}
export {
  createMatchers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3RleHRNYXRlU2NvcGVNYXRjaGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1hdGNoZXJXaXRoUHJpb3JpdHk8VD4ge1xuXHRtYXRjaGVyOiBNYXRjaGVyPFQ+O1xuXHRwcmlvcml0eTogLTEgfCAwIHwgMTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNYXRjaGVyPFQ+IHtcblx0KG1hdGNoZXJJbnB1dDogVCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1hdGNoZXJzPFQ+KHNlbGVjdG9yOiBzdHJpbmcsIG1hdGNoZXNOYW1lOiAobmFtZXM6IHN0cmluZ1tdLCBtYXRjaGVySW5wdXQ6IFQpID0+IG51bWJlciwgcmVzdWx0czogTWF0Y2hlcldpdGhQcmlvcml0eTxUPltdKTogdm9pZCB7XG5cdGNvbnN0IHRva2VuaXplciA9IG5ld1Rva2VuaXplcihzZWxlY3Rvcik7XG5cdGxldCB0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdHdoaWxlICh0b2tlbiAhPT0gbnVsbCkge1xuXHRcdGxldCBwcmlvcml0eTogLTEgfCAwIHwgMSA9IDA7XG5cdFx0aWYgKHRva2VuLmxlbmd0aCA9PT0gMiAmJiB0b2tlbi5jaGFyQXQoMSkgPT09ICc6Jykge1xuXHRcdFx0c3dpdGNoICh0b2tlbi5jaGFyQXQoMCkpIHtcblx0XHRcdFx0Y2FzZSAnUic6IHByaW9yaXR5ID0gMTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0wnOiBwcmlvcml0eSA9IC0xOyBicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhgVW5rbm93biBwcmlvcml0eSAke3Rva2VufSBpbiBzY29wZSBzZWxlY3RvcmApO1xuXHRcdFx0fVxuXHRcdFx0dG9rZW4gPSB0b2tlbml6ZXIubmV4dCgpO1xuXHRcdH1cblx0XHRjb25zdCBtYXRjaGVyID0gcGFyc2VDb25qdW5jdGlvbigpO1xuXHRcdGlmIChtYXRjaGVyKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goeyBtYXRjaGVyLCBwcmlvcml0eSB9KTtcblx0XHR9XG5cdFx0aWYgKHRva2VuICE9PSAnLCcpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHR0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdH1cblxuXHRmdW5jdGlvbiBwYXJzZU9wZXJhbmQoKTogTWF0Y2hlcjxUPiB8IG51bGwge1xuXHRcdGlmICh0b2tlbiA9PT0gJy0nKSB7XG5cdFx0XHR0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdFx0XHRjb25zdCBleHByZXNzaW9uVG9OZWdhdGUgPSBwYXJzZU9wZXJhbmQoKTtcblx0XHRcdGlmICghZXhwcmVzc2lvblRvTmVnYXRlKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hdGNoZXJJbnB1dCA9PiB7XG5cdFx0XHRcdGNvbnN0IHNjb3JlID0gZXhwcmVzc2lvblRvTmVnYXRlKG1hdGNoZXJJbnB1dCk7XG5cdFx0XHRcdHJldHVybiBzY29yZSA8IDAgPyAwIDogLTE7XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAodG9rZW4gPT09ICcoJykge1xuXHRcdFx0dG9rZW4gPSB0b2tlbml6ZXIubmV4dCgpO1xuXHRcdFx0Y29uc3QgZXhwcmVzc2lvbkluUGFyZW50cyA9IHBhcnNlSW5uZXJFeHByZXNzaW9uKCk7XG5cdFx0XHRpZiAodG9rZW4gPT09ICcpJykge1xuXHRcdFx0XHR0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXhwcmVzc2lvbkluUGFyZW50cztcblx0XHR9XG5cdFx0aWYgKGlzSWRlbnRpZmllcih0b2tlbikpIHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRpZGVudGlmaWVycy5wdXNoKHRva2VuKTtcblx0XHRcdFx0dG9rZW4gPSB0b2tlbml6ZXIubmV4dCgpO1xuXHRcdFx0fSB3aGlsZSAoaXNJZGVudGlmaWVyKHRva2VuKSk7XG5cdFx0XHRyZXR1cm4gbWF0Y2hlcklucHV0ID0+IG1hdGNoZXNOYW1lKGlkZW50aWZpZXJzLCBtYXRjaGVySW5wdXQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRmdW5jdGlvbiBwYXJzZUNvbmp1bmN0aW9uKCk6IE1hdGNoZXI8VD4gfCBudWxsIHtcblx0XHRsZXQgbWF0Y2hlciA9IHBhcnNlT3BlcmFuZCgpO1xuXHRcdGlmICghbWF0Y2hlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hlcnM6IE1hdGNoZXI8VD5bXSA9IFtdO1xuXHRcdHdoaWxlIChtYXRjaGVyKSB7XG5cdFx0XHRtYXRjaGVycy5wdXNoKG1hdGNoZXIpO1xuXHRcdFx0bWF0Y2hlciA9IHBhcnNlT3BlcmFuZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2hlcklucHV0ID0+IHsgIC8vIGFuZFxuXHRcdFx0bGV0IG1pbiA9IG1hdGNoZXJzWzBdKG1hdGNoZXJJbnB1dCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgbWluID49IDAgJiYgaSA8IG1hdGNoZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdG1pbiA9IE1hdGgubWluKG1pbiwgbWF0Y2hlcnNbaV0obWF0Y2hlcklucHV0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWluO1xuXHRcdH07XG5cdH1cblx0ZnVuY3Rpb24gcGFyc2VJbm5lckV4cHJlc3Npb24oKTogTWF0Y2hlcjxUPiB8IG51bGwge1xuXHRcdGxldCBtYXRjaGVyID0gcGFyc2VDb25qdW5jdGlvbigpO1xuXHRcdGlmICghbWF0Y2hlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoZXJzOiBNYXRjaGVyPFQ+W10gPSBbXTtcblx0XHR3aGlsZSAobWF0Y2hlcikge1xuXHRcdFx0bWF0Y2hlcnMucHVzaChtYXRjaGVyKTtcblx0XHRcdGlmICh0b2tlbiA9PT0gJ3wnIHx8IHRva2VuID09PSAnLCcpIHtcblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdHRva2VuID0gdG9rZW5pemVyLm5leHQoKTtcblx0XHRcdFx0fSB3aGlsZSAodG9rZW4gPT09ICd8JyB8fCB0b2tlbiA9PT0gJywnKTsgLy8gaWdub3JlIHN1YnNlcXVlbnQgY29tbWFzXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdG1hdGNoZXIgPSBwYXJzZUNvbmp1bmN0aW9uKCk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGVySW5wdXQgPT4geyAgLy8gb3Jcblx0XHRcdGxldCBtYXggPSBtYXRjaGVyc1swXShtYXRjaGVySW5wdXQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRtYXggPSBNYXRoLm1heChtYXgsIG1hdGNoZXJzW2ldKG1hdGNoZXJJbnB1dCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1heDtcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzSWRlbnRpZmllcih0b2tlbjogc3RyaW5nIHwgbnVsbCk6IHRva2VuIGlzIHN0cmluZyB7XG5cdHJldHVybiAhIXRva2VuICYmICEhdG9rZW4ubWF0Y2goL1tcXHdcXC46XSsvKTtcbn1cblxuZnVuY3Rpb24gbmV3VG9rZW5pemVyKGlucHV0OiBzdHJpbmcpOiB7IG5leHQ6ICgpID0+IHN0cmluZyB8IG51bGwgfSB7XG5cdGNvbnN0IHJlZ2V4ID0gLyhbTFJdOnxbXFx3XFwuOl1bXFx3XFwuOlxcLV0qfFtcXCxcXHxcXC1cXChcXCldKS9nO1xuXHRsZXQgbWF0Y2ggPSByZWdleC5leGVjKGlucHV0KTtcblx0cmV0dXJuIHtcblx0XHRuZXh0OiAoKSA9PiB7XG5cdFx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzID0gbWF0Y2hbMF07XG5cdFx0XHRtYXRjaCA9IHJlZ2V4LmV4ZWMoaW5wdXQpO1xuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFnQk8sU0FBUyxlQUFrQixVQUFrQixhQUEyRCxTQUF5QztBQUN2SixRQUFNLFlBQVksYUFBYSxRQUFRO0FBQ3ZDLE1BQUksUUFBUSxVQUFVLEtBQUs7QUFDM0IsU0FBTyxVQUFVLE1BQU07QUFDdEIsUUFBSSxXQUF1QjtBQUMzQixRQUFJLE1BQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxDQUFDLE1BQU0sS0FBSztBQUNsRCxjQUFRLE1BQU0sT0FBTyxDQUFDLEdBQUc7QUFBQSxRQUN4QixLQUFLO0FBQUsscUJBQVc7QUFBRztBQUFBLFFBQ3hCLEtBQUs7QUFBSyxxQkFBVztBQUFJO0FBQUEsUUFDekI7QUFDQyxrQkFBUSxJQUFJLG9CQUFvQixLQUFLLG9CQUFvQjtBQUFBLE1B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
