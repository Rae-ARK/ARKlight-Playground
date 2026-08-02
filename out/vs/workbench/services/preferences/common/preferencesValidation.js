import * as nls from "../../../../nls.js";
import { Color } from "../../../../base/common/color.js";
import { isObject, isUndefinedOrNull, isString, isStringArray } from "../../../../base/common/types.js";
function canBeType(propTypes, ...types) {
  return types.some((t) => propTypes.includes(t));
}
function isNullOrEmpty(value) {
  return value === "" || isUndefinedOrNull(value);
}
function createValidator(prop) {
  const type = Array.isArray(prop.type) ? prop.type : [prop.type];
  const isNullable = canBeType(type, "null");
  const isNumeric = (canBeType(type, "number") || canBeType(type, "integer")) && (type.length === 1 || type.length === 2 && isNullable);
  const numericValidations = getNumericValidators(prop);
  const stringValidations = getStringValidators(prop);
  const arrayValidator = getArrayValidator(prop);
  const objectValidator = getObjectValidator(prop);
  return (value) => {
    if (isNullable && isNullOrEmpty(value)) {
      return "";
    }
    const errors = [];
    if (arrayValidator) {
      const err = arrayValidator(value);
      if (err) {
        errors.push(err);
      }
    }
    if (objectValidator) {
      const err = objectValidator(value);
      if (err) {
        errors.push(err);
      }
    }
    if (prop.type === "boolean" && value !== true && value !== false) {
      errors.push(nls.localize("validations.booleanIncorrectType", 'Incorrect type. Expected "boolean".'));
    }
    if (isNumeric) {
      if (isNullOrEmpty(value) || typeof value === "boolean" || Array.isArray(value) || isNaN(+value)) {
        errors.push(nls.localize("validations.expectedNumeric", "Value must be a number."));
      } else {
        errors.push(...numericValidations.filter((validator) => !validator.isValid(+value)).map((validator) => validator.message));
      }
    }
    if (prop.type === "string") {
      if (prop.enum && !isStringArray(prop.enum)) {
        errors.push(nls.localize("validations.stringIncorrectEnumOptions", "The enum options should be strings, but there is a non-string option. Please file an issue with the extension author."));
      } else if (!isString(value)) {
        errors.push(nls.localize("validations.stringIncorrectType", 'Incorrect type. Expected "string".'));
      } else {
        errors.push(...stringValidations.filter((validator) => !validator.isValid(value)).map((validator) => validator.message));
      }
    }
    if (errors.length) {
      return prop.errorMessage ? [prop.errorMessage, ...errors].join(" ") : errors.join(" ");
    }
    return "";
  };
}
function getInvalidTypeError(value, type) {
  if (typeof type === "undefined") {
    return;
  }
  const typeArr = Array.isArray(type) ? type : [type];
  if (!typeArr.some((_type) => valueValidatesAsType(value, _type))) {
    return nls.localize("invalidTypeError", "Setting has an invalid type, expected {0}. Fix in JSON.", JSON.stringify(type));
  }
  return;
}
function valueValidatesAsType(value, type) {
  const valueType = typeof value;
  if (type === "boolean") {
    return valueType === "boolean";
  } else if (type === "object") {
    return value && !Array.isArray(value) && valueType === "object";
  } else if (type === "null") {
    return value === null;
  } else if (type === "array") {
    return Array.isArray(value);
  } else if (type === "string") {
    return valueType === "string";
  } else if (type === "number" || type === "integer") {
    return valueType === "number";
  }
  return true;
}
function toRegExp(pattern) {
  try {
    return new RegExp(pattern, "u");
  } catch (e) {
    try {
      return new RegExp(pattern);
    } catch (e2) {
      console.error(nls.localize("regexParsingError", "Error parsing the following regex both with and without the u flag:"), pattern);
      return /.*/;
    }
  }
}
function getStringValidators(prop) {
  const uriRegex = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
  let patternRegex;
  if (typeof prop.pattern === "string") {
    patternRegex = toRegExp(prop.pattern);
  }
  return [
    {
      enabled: prop.maxLength !== void 0,
      isValid: ((value) => value.length <= prop.maxLength),
      message: nls.localize("validations.maxLength", "Value must be {0} or fewer characters long.", prop.maxLength)
    },
    {
      enabled: prop.minLength !== void 0,
      isValid: ((value) => value.length >= prop.minLength),
      message: nls.localize("validations.minLength", "Value must be {0} or more characters long.", prop.minLength)
    },
    {
      enabled: patternRegex !== void 0,
      isValid: ((value) => patternRegex.test(value)),
      message: prop.patternErrorMessage || nls.localize("validations.regex", "Value must match regex `{0}`.", prop.pattern)
    },
    {
      enabled: prop.format === "color-hex",
      isValid: ((value) => Color.Format.CSS.parseHex(value)),
      message: nls.localize("validations.colorFormat", "Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.")
    },
    {
      enabled: prop.format === "uri" || prop.format === "uri-reference",
      isValid: ((value) => !!value.length),
      message: nls.localize("validations.uriEmpty", "URI expected.")
    },
    {
      enabled: prop.format === "uri" || prop.format === "uri-reference",
      isValid: ((value) => uriRegex.test(value)),
      message: nls.localize("validations.uriMissing", "URI is expected.")
    },
    {
      enabled: prop.format === "uri",
      isValid: ((value) => {
        const matches = value.match(uriRegex);
        return !!(matches && matches[2]);
      }),
      message: nls.localize("validations.uriSchemeMissing", "URI with a scheme is expected.")
    },
    {
      enabled: prop.enum !== void 0,
      isValid: ((value) => {
        return prop.enum.includes(value);
      }),
      message: nls.localize(
        "validations.invalidStringEnumValue",
        "Value is not accepted. Valid values: {0}.",
        prop.enum ? prop.enum.map((key) => `"${key}"`).join(", ") : "[]"
      )
    }
  ].filter((validation) => validation.enabled);
}
function getNumericValidators(prop) {
  const type = Array.isArray(prop.type) ? prop.type : [prop.type];
  const isNullable = canBeType(type, "null");
  const isIntegral = canBeType(type, "integer") && (type.length === 1 || type.length === 2 && isNullable);
  const isNumeric = canBeType(type, "number", "integer") && (type.length === 1 || type.length === 2 && isNullable);
  if (!isNumeric) {
    return [];
  }
  let exclusiveMax;
  let exclusiveMin;
  if (typeof prop.exclusiveMaximum === "boolean") {
    exclusiveMax = prop.exclusiveMaximum ? prop.maximum : void 0;
  } else {
    exclusiveMax = prop.exclusiveMaximum;
  }
  if (typeof prop.exclusiveMinimum === "boolean") {
    exclusiveMin = prop.exclusiveMinimum ? prop.minimum : void 0;
  } else {
    exclusiveMin = prop.exclusiveMinimum;
  }
  return [
    {
      enabled: exclusiveMax !== void 0 && (prop.maximum === void 0 || exclusiveMax <= prop.maximum),
      isValid: ((value) => value < exclusiveMax),
      message: nls.localize("validations.exclusiveMax", "Value must be strictly less than {0}.", exclusiveMax)
    },
    {
      enabled: exclusiveMin !== void 0 && (prop.minimum === void 0 || exclusiveMin >= prop.minimum),
      isValid: ((value) => value > exclusiveMin),
      message: nls.localize("validations.exclusiveMin", "Value must be strictly greater than {0}.", exclusiveMin)
    },
    {
      enabled: prop.maximum !== void 0 && (exclusiveMax === void 0 || exclusiveMax > prop.maximum),
      isValid: ((value) => value <= prop.maximum),
      message: nls.localize("validations.max", "Value must be less than or equal to {0}.", prop.maximum)
    },
    {
      enabled: prop.minimum !== void 0 && (exclusiveMin === void 0 || exclusiveMin < prop.minimum),
      isValid: ((value) => value >= prop.minimum),
      message: nls.localize("validations.min", "Value must be greater than or equal to {0}.", prop.minimum)
    },
    {
      enabled: prop.multipleOf !== void 0,
      isValid: ((value) => value % prop.multipleOf === 0),
      message: nls.localize("validations.multipleOf", "Value must be a multiple of {0}.", prop.multipleOf)
    },
    {
      enabled: isIntegral,
      isValid: ((value) => value % 1 === 0),
      message: nls.localize("validations.expectedInteger", "Value must be an integer.")
    }
  ].filter((validation) => validation.enabled);
}
function getArrayValidator(prop) {
  if (prop.type === "array" && prop.items && !Array.isArray(prop.items)) {
    const propItems = prop.items;
    if (propItems && !Array.isArray(propItems.type)) {
      const withQuotes = (s) => `'` + s + `'`;
      return (value) => {
        if (!value) {
          return null;
        }
        let message = "";
        if (!Array.isArray(value)) {
          message += nls.localize("validations.arrayIncorrectType", "Incorrect type. Expected an array.");
          message += "\n";
          return message;
        }
        const arrayValue = value;
        if (prop.uniqueItems) {
          if (new Set(arrayValue).size < arrayValue.length) {
            message += nls.localize("validations.stringArrayUniqueItems", "Array has duplicate items");
            message += "\n";
          }
        }
        if (prop.minItems && arrayValue.length < prop.minItems) {
          message += nls.localize("validations.stringArrayMinItem", "Array must have at least {0} items", prop.minItems);
          message += "\n";
        }
        if (prop.maxItems && arrayValue.length > prop.maxItems) {
          message += nls.localize("validations.stringArrayMaxItem", "Array must have at most {0} items", prop.maxItems);
          message += "\n";
        }
        if (propItems.type === "string") {
          if (!isStringArray(arrayValue)) {
            message += nls.localize("validations.stringArrayIncorrectType", "Incorrect type. Expected a string array.");
            message += "\n";
            return message;
          }
          if (typeof propItems.pattern === "string") {
            const patternRegex = toRegExp(propItems.pattern);
            arrayValue.forEach((v) => {
              if (!patternRegex.test(v)) {
                message += propItems.patternErrorMessage || nls.localize(
                  "validations.stringArrayItemPattern",
                  "Value {0} must match regex {1}.",
                  withQuotes(v),
                  withQuotes(propItems.pattern)
                );
              }
            });
          }
          const propItemsEnum = propItems.enum;
          if (propItemsEnum) {
            arrayValue.forEach((v) => {
              if (propItemsEnum.indexOf(v) === -1) {
                message += nls.localize(
                  "validations.stringArrayItemEnum",
                  "Value {0} is not one of {1}",
                  withQuotes(v),
                  "[" + propItemsEnum.map(withQuotes).join(", ") + "]"
                );
                message += "\n";
              }
            });
          }
        } else if (propItems.type === "integer" || propItems.type === "number") {
          arrayValue.forEach((v) => {
            const errorMessage = getErrorsForSchema(propItems, v);
            if (errorMessage) {
              message += `${v}: ${errorMessage}
`;
            }
          });
        }
        return message;
      };
    }
  }
  return null;
}
function getObjectValidator(prop) {
  if (prop.type === "object") {
    const { properties, patternProperties, additionalProperties, propertyNames } = prop;
    return (value) => {
      if (!value) {
        return null;
      }
      const errors = [];
      let propertyNamesErrorShown = false;
      if (!isObject(value)) {
        errors.push(nls.localize("validations.objectIncorrectType", "Incorrect type. Expected an object."));
      } else {
        Object.keys(value).forEach((key) => {
          const data = value[key];
          if (propertyNames?.pattern && !propertyNamesErrorShown) {
            const patternRegex = toRegExp(propertyNames.pattern);
            if (!patternRegex.test(key)) {
              const errorMessage = propertyNames.patternErrorMessage || nls.localize("validations.propertyNamePattern", "Property name must match pattern `{0}`.", propertyNames.pattern);
              errors.push(errorMessage + "\n");
              propertyNamesErrorShown = true;
            }
          }
          if (properties && key in properties) {
            const errorMessage = getErrorsForSchema(properties[key], data);
            if (errorMessage) {
              errors.push(`${key}: ${errorMessage}
`);
            }
            return;
          }
          if (patternProperties) {
            for (const pattern in patternProperties) {
              if (RegExp(pattern).test(key)) {
                const errorMessage = getErrorsForSchema(patternProperties[pattern], data);
                if (errorMessage) {
                  errors.push(`${key}: ${errorMessage}
`);
                }
                return;
              }
            }
          }
          if (additionalProperties === false) {
            errors.push(nls.localize("validations.objectPattern", "Property {0} is not allowed.\n", key));
          } else if (typeof additionalProperties === "object") {
            const errorMessage = getErrorsForSchema(additionalProperties, data);
            if (errorMessage) {
              errors.push(`${key}: ${errorMessage}
`);
            }
          }
        });
      }
      if (errors.length) {
        return prop.errorMessage ? [prop.errorMessage, ...errors].join(" ") : errors.join(" ");
      }
      return "";
    };
  }
  return null;
}
function validatePropertyName(propertyNames, key) {
  if (!propertyNames?.pattern) {
    return true;
  }
  const patternRegex = toRegExp(propertyNames.pattern);
  return patternRegex.test(key);
}
function getErrorsForSchema(propertySchema, data) {
  const validator = createValidator(propertySchema);
  const errorMessage = validator(data);
  return errorMessage;
}
export {
  createValidator,
  getInvalidTypeError,
  validatePropertyName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNWYWxpZGF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBKU09OU2NoZW1hVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNVbmRlZmluZWRPck51bGwsIGlzU3RyaW5nLCBpc1N0cmluZ0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5cbnR5cGUgVmFsaWRhdG9yPFQ+ID0geyBlbmFibGVkOiBib29sZWFuOyBpc1ZhbGlkOiAodmFsdWU6IFQpID0+IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBjYW5CZVR5cGUocHJvcFR5cGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdLCAuLi50eXBlczogSlNPTlNjaGVtYVR5cGVbXSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdHlwZXMuc29tZSh0ID0+IHByb3BUeXBlcy5pbmNsdWRlcyh0KSk7XG59XG5cbmZ1bmN0aW9uIGlzTnVsbE9yRW1wdHkodmFsdWU6IHVua25vd24pOiBib29sZWFuIHtcblx0cmV0dXJuIHZhbHVlID09PSAnJyB8fCBpc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVWYWxpZGF0b3IocHJvcDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSk6ICh2YWx1ZTogYW55KSA9PiAoc3RyaW5nIHwgbnVsbCkge1xuXHRjb25zdCB0eXBlOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gQXJyYXkuaXNBcnJheShwcm9wLnR5cGUpID8gcHJvcC50eXBlIDogW3Byb3AudHlwZV07XG5cdGNvbnN0IGlzTnVsbGFibGUgPSBjYW5CZVR5cGUodHlwZSwgJ251bGwnKTtcblx0Y29uc3QgaXNOdW1lcmljID0gKGNhbkJlVHlwZSh0eXBlLCAnbnVtYmVyJykgfHwgY2FuQmVUeXBlKHR5cGUsICdpbnRlZ2VyJykpICYmICh0eXBlLmxlbmd0aCA9PT0gMSB8fCB0eXBlLmxlbmd0aCA9PT0gMiAmJiBpc051bGxhYmxlKTtcblxuXHRjb25zdCBudW1lcmljVmFsaWRhdGlvbnMgPSBnZXROdW1lcmljVmFsaWRhdG9ycyhwcm9wKTtcblx0Y29uc3Qgc3RyaW5nVmFsaWRhdGlvbnMgPSBnZXRTdHJpbmdWYWxpZGF0b3JzKHByb3ApO1xuXHRjb25zdCBhcnJheVZhbGlkYXRvciA9IGdldEFycmF5VmFsaWRhdG9yKHByb3ApO1xuXHRjb25zdCBvYmplY3RWYWxpZGF0b3IgPSBnZXRPYmplY3RWYWxpZGF0b3IocHJvcCk7XG5cblx0cmV0dXJuIHZhbHVlID0+IHtcblx0XHRpZiAoaXNOdWxsYWJsZSAmJiBpc051bGxPckVtcHR5KHZhbHVlKSkgeyByZXR1cm4gJyc7IH1cblxuXHRcdGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoYXJyYXlWYWxpZGF0b3IpIHtcblx0XHRcdGNvbnN0IGVyciA9IGFycmF5VmFsaWRhdG9yKHZhbHVlKTtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2goZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAob2JqZWN0VmFsaWRhdG9yKSB7XG5cdFx0XHRjb25zdCBlcnIgPSBvYmplY3RWYWxpZGF0b3IodmFsdWUpO1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRlcnJvcnMucHVzaChlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwcm9wLnR5cGUgPT09ICdib29sZWFuJyAmJiB2YWx1ZSAhPT0gdHJ1ZSAmJiB2YWx1ZSAhPT0gZmFsc2UpIHtcblx0XHRcdGVycm9ycy5wdXNoKG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuYm9vbGVhbkluY29ycmVjdFR5cGUnLCAnSW5jb3JyZWN0IHR5cGUuIEV4cGVjdGVkIFwiYm9vbGVhblwiLicpKTtcblx0XHR9XG5cblx0XHRpZiAoaXNOdW1lcmljKSB7XG5cdFx0XHRpZiAoaXNOdWxsT3JFbXB0eSh2YWx1ZSkgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgaXNOYU4oK3ZhbHVlKSkge1xuXHRcdFx0XHRlcnJvcnMucHVzaChubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLmV4cGVjdGVkTnVtZXJpYycsIFwiVmFsdWUgbXVzdCBiZSBhIG51bWJlci5cIikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2goLi4ubnVtZXJpY1ZhbGlkYXRpb25zLmZpbHRlcih2YWxpZGF0b3IgPT4gIXZhbGlkYXRvci5pc1ZhbGlkKCt2YWx1ZSkpLm1hcCh2YWxpZGF0b3IgPT4gdmFsaWRhdG9yLm1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocHJvcC50eXBlID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKHByb3AuZW51bSAmJiAhaXNTdHJpbmdBcnJheShwcm9wLmVudW0pKSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuc3RyaW5nSW5jb3JyZWN0RW51bU9wdGlvbnMnLCAnVGhlIGVudW0gb3B0aW9ucyBzaG91bGQgYmUgc3RyaW5ncywgYnV0IHRoZXJlIGlzIGEgbm9uLXN0cmluZyBvcHRpb24uIFBsZWFzZSBmaWxlIGFuIGlzc3VlIHdpdGggdGhlIGV4dGVuc2lvbiBhdXRob3IuJykpO1xuXHRcdFx0fSBlbHNlIGlmICghaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuc3RyaW5nSW5jb3JyZWN0VHlwZScsICdJbmNvcnJlY3QgdHlwZS4gRXhwZWN0ZWQgXCJzdHJpbmdcIi4nKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlcnJvcnMucHVzaCguLi5zdHJpbmdWYWxpZGF0aW9ucy5maWx0ZXIodmFsaWRhdG9yID0+ICF2YWxpZGF0b3IuaXNWYWxpZCh2YWx1ZSkpLm1hcCh2YWxpZGF0b3IgPT4gdmFsaWRhdG9yLm1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHByb3AuZXJyb3JNZXNzYWdlID8gW3Byb3AuZXJyb3JNZXNzYWdlLCAuLi5lcnJvcnNdLmpvaW4oJyAnKSA6IGVycm9ycy5qb2luKCcgJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9O1xufVxuXG4vKipcbiAqIFJldHVybnMgYW4gZXJyb3Igc3RyaW5nIGlmIHRoZSB2YWx1ZSBpcyBpbnZhbGlkIGFuZCBjYW4ndCBiZSBkaXNwbGF5ZWQgaW4gdGhlIHNldHRpbmdzIFVJIGZvciB0aGUgZ2l2ZW4gdHlwZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEludmFsaWRUeXBlRXJyb3IodmFsdWU6IGFueSwgdHlwZTogdW5kZWZpbmVkIHwgc3RyaW5nIHwgc3RyaW5nW10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIHR5cGUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgdHlwZUFyciA9IEFycmF5LmlzQXJyYXkodHlwZSkgPyB0eXBlIDogW3R5cGVdO1xuXHRpZiAoIXR5cGVBcnIuc29tZShfdHlwZSA9PiB2YWx1ZVZhbGlkYXRlc0FzVHlwZSh2YWx1ZSwgX3R5cGUpKSkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ2ludmFsaWRUeXBlRXJyb3InLCBcIlNldHRpbmcgaGFzIGFuIGludmFsaWQgdHlwZSwgZXhwZWN0ZWQgezB9LiBGaXggaW4gSlNPTi5cIiwgSlNPTi5zdHJpbmdpZnkodHlwZSkpO1xuXHR9XG5cblx0cmV0dXJuO1xufVxuXG5mdW5jdGlvbiB2YWx1ZVZhbGlkYXRlc0FzVHlwZSh2YWx1ZTogYW55LCB0eXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdmFsdWVUeXBlID0gdHlwZW9mIHZhbHVlO1xuXHRpZiAodHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0cmV0dXJuIHZhbHVlVHlwZSA9PT0gJ2Jvb2xlYW4nO1xuXHR9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHZhbHVlICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZVR5cGUgPT09ICdvYmplY3QnO1xuXHR9IGVsc2UgaWYgKHR5cGUgPT09ICdudWxsJykge1xuXHRcdHJldHVybiB2YWx1ZSA9PT0gbnVsbDtcblx0fSBlbHNlIGlmICh0eXBlID09PSAnYXJyYXknKSB7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpO1xuXHR9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHZhbHVlVHlwZSA9PT0gJ3N0cmluZyc7XG5cdH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgfHwgdHlwZSA9PT0gJ2ludGVnZXInKSB7XG5cdFx0cmV0dXJuIHZhbHVlVHlwZSA9PT0gJ251bWJlcic7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdG9SZWdFeHAocGF0dGVybjogc3RyaW5nKTogUmVnRXhwIHtcblx0dHJ5IHtcblx0XHQvLyBUaGUgdSBmbGFnIGFsbG93cyBzdXBwb3J0IGZvciBiZXR0ZXIgVW5pY29kZSBtYXRjaGluZyxcblx0XHQvLyBidXQgZGVwcmVjYXRlcyBzb21lIHBhdHRlcm5zIHN1Y2ggYXMgW1xccy05XVxuXHRcdC8vIFJlZiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9SZWd1bGFyX2V4cHJlc3Npb25zL0NoYXJhY3Rlcl9jbGFzcyNkZXNjcmlwdGlvblxuXHRcdHJldHVybiBuZXcgUmVnRXhwKHBhdHRlcm4sICd1Jyk7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAocGF0dGVybik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gSWYgdGhlIHBhdHRlcm4gY2FuJ3QgYmUgcGFyc2VkIGV2ZW4gd2l0aG91dCB0aGUgJ3UnIGZsYWcsXG5cdFx0XHQvLyBqdXN0IGxvZyB0aGUgZXJyb3IgdG8gYXZvaWQgcmVuZGVyaW5nIHRoZSBlbnRpcmUgU2V0dGluZ3MgZWRpdG9yIGJsYW5rLlxuXHRcdFx0Ly8gUmVmIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTUwNTRcblx0XHRcdGNvbnNvbGUuZXJyb3IobmxzLmxvY2FsaXplKCdyZWdleFBhcnNpbmdFcnJvcicsIFwiRXJyb3IgcGFyc2luZyB0aGUgZm9sbG93aW5nIHJlZ2V4IGJvdGggd2l0aCBhbmQgd2l0aG91dCB0aGUgdSBmbGFnOlwiKSwgcGF0dGVybik7XG5cdFx0XHRyZXR1cm4gLy4qLztcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U3RyaW5nVmFsaWRhdG9ycyhwcm9wOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKSB7XG5cdGNvbnN0IHVyaVJlZ2V4ID0gL14oKFteOi8/I10rPyk6KT8oXFwvXFwvKFteLz8jXSopKT8oW14/I10qKShcXD8oW14jXSopKT8oIyguKikpPy87XG5cdGxldCBwYXR0ZXJuUmVnZXg6IFJlZ0V4cCB8IHVuZGVmaW5lZDtcblx0aWYgKHR5cGVvZiBwcm9wLnBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG5cdFx0cGF0dGVyblJlZ2V4ID0gdG9SZWdFeHAocHJvcC5wYXR0ZXJuKTtcblx0fVxuXG5cdHJldHVybiBbXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcHJvcC5tYXhMZW5ndGggIT09IHVuZGVmaW5lZCxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IHsgbGVuZ3RoOiBudW1iZXIgfSkgPT4gdmFsdWUubGVuZ3RoIDw9IHByb3AubWF4TGVuZ3RoISksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLm1heExlbmd0aCcsIFwiVmFsdWUgbXVzdCBiZSB7MH0gb3IgZmV3ZXIgY2hhcmFjdGVycyBsb25nLlwiLCBwcm9wLm1heExlbmd0aClcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AubWluTGVuZ3RoICE9PSB1bmRlZmluZWQsXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiB7IGxlbmd0aDogbnVtYmVyIH0pID0+IHZhbHVlLmxlbmd0aCA+PSBwcm9wLm1pbkxlbmd0aCEpLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5taW5MZW5ndGgnLCBcIlZhbHVlIG11c3QgYmUgezB9IG9yIG1vcmUgY2hhcmFjdGVycyBsb25nLlwiLCBwcm9wLm1pbkxlbmd0aClcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHBhdHRlcm5SZWdleCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogc3RyaW5nKSA9PiBwYXR0ZXJuUmVnZXghLnRlc3QodmFsdWUpKSxcblx0XHRcdG1lc3NhZ2U6IHByb3AucGF0dGVybkVycm9yTWVzc2FnZSB8fCBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLnJlZ2V4JywgXCJWYWx1ZSBtdXN0IG1hdGNoIHJlZ2V4IGB7MH1gLlwiLCBwcm9wLnBhdHRlcm4pXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBwcm9wLmZvcm1hdCA9PT0gJ2NvbG9yLWhleCcsXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBzdHJpbmcpID0+IENvbG9yLkZvcm1hdC5DU1MucGFyc2VIZXgodmFsdWUpKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuY29sb3JGb3JtYXQnLCBcIkludmFsaWQgY29sb3IgZm9ybWF0LiBVc2UgI1JHQiwgI1JHQkEsICNSUkdHQkIgb3IgI1JSR0dCQkFBLlwiKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcHJvcC5mb3JtYXQgPT09ICd1cmknIHx8IHByb3AuZm9ybWF0ID09PSAndXJpLXJlZmVyZW5jZScsXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBzdHJpbmcpID0+ICEhdmFsdWUubGVuZ3RoKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMudXJpRW1wdHknLCBcIlVSSSBleHBlY3RlZC5cIilcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AuZm9ybWF0ID09PSAndXJpJyB8fCBwcm9wLmZvcm1hdCA9PT0gJ3VyaS1yZWZlcmVuY2UnLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogc3RyaW5nKSA9PiB1cmlSZWdleC50ZXN0KHZhbHVlKSksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLnVyaU1pc3NpbmcnLCBcIlVSSSBpcyBleHBlY3RlZC5cIilcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AuZm9ybWF0ID09PSAndXJpJyxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gdmFsdWUubWF0Y2godXJpUmVnZXgpO1xuXHRcdFx0XHRyZXR1cm4gISEobWF0Y2hlcyAmJiBtYXRjaGVzWzJdKTtcblx0XHRcdH0pLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy51cmlTY2hlbWVNaXNzaW5nJywgXCJVUkkgd2l0aCBhIHNjaGVtZSBpcyBleHBlY3RlZC5cIilcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AuZW51bSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHJldHVybiBwcm9wLmVudW0hLmluY2x1ZGVzKHZhbHVlKTtcblx0XHRcdH0pLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5pbnZhbGlkU3RyaW5nRW51bVZhbHVlJywgXCJWYWx1ZSBpcyBub3QgYWNjZXB0ZWQuIFZhbGlkIHZhbHVlczogezB9LlwiLFxuXHRcdFx0XHRwcm9wLmVudW0gPyBwcm9wLmVudW0ubWFwKGtleSA9PiBgXCIke2tleX1cImApLmpvaW4oJywgJykgOiAnW10nKVxuXHRcdH1cblx0XS5maWx0ZXIodmFsaWRhdGlvbiA9PiB2YWxpZGF0aW9uLmVuYWJsZWQpO1xufVxuXG5mdW5jdGlvbiBnZXROdW1lcmljVmFsaWRhdG9ycyhwcm9wOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKTogVmFsaWRhdG9yPG51bWJlcj5bXSB7XG5cdGNvbnN0IHR5cGU6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBBcnJheS5pc0FycmF5KHByb3AudHlwZSkgPyBwcm9wLnR5cGUgOiBbcHJvcC50eXBlXTtcblxuXHRjb25zdCBpc051bGxhYmxlID0gY2FuQmVUeXBlKHR5cGUsICdudWxsJyk7XG5cdGNvbnN0IGlzSW50ZWdyYWwgPSAoY2FuQmVUeXBlKHR5cGUsICdpbnRlZ2VyJykpICYmICh0eXBlLmxlbmd0aCA9PT0gMSB8fCB0eXBlLmxlbmd0aCA9PT0gMiAmJiBpc051bGxhYmxlKTtcblx0Y29uc3QgaXNOdW1lcmljID0gY2FuQmVUeXBlKHR5cGUsICdudW1iZXInLCAnaW50ZWdlcicpICYmICh0eXBlLmxlbmd0aCA9PT0gMSB8fCB0eXBlLmxlbmd0aCA9PT0gMiAmJiBpc051bGxhYmxlKTtcblx0aWYgKCFpc051bWVyaWMpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRsZXQgZXhjbHVzaXZlTWF4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBleGNsdXNpdmVNaW46IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRpZiAodHlwZW9mIHByb3AuZXhjbHVzaXZlTWF4aW11bSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0ZXhjbHVzaXZlTWF4ID0gcHJvcC5leGNsdXNpdmVNYXhpbXVtID8gcHJvcC5tYXhpbXVtIDogdW5kZWZpbmVkO1xuXHR9IGVsc2Uge1xuXHRcdGV4Y2x1c2l2ZU1heCA9IHByb3AuZXhjbHVzaXZlTWF4aW11bTtcblx0fVxuXG5cdGlmICh0eXBlb2YgcHJvcC5leGNsdXNpdmVNaW5pbXVtID09PSAnYm9vbGVhbicpIHtcblx0XHRleGNsdXNpdmVNaW4gPSBwcm9wLmV4Y2x1c2l2ZU1pbmltdW0gPyBwcm9wLm1pbmltdW0gOiB1bmRlZmluZWQ7XG5cdH0gZWxzZSB7XG5cdFx0ZXhjbHVzaXZlTWluID0gcHJvcC5leGNsdXNpdmVNaW5pbXVtO1xuXHR9XG5cblx0cmV0dXJuIFtcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBleGNsdXNpdmVNYXggIT09IHVuZGVmaW5lZCAmJiAocHJvcC5tYXhpbXVtID09PSB1bmRlZmluZWQgfHwgZXhjbHVzaXZlTWF4IDw9IHByb3AubWF4aW11bSksXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBudW1iZXIpID0+IHZhbHVlIDwgZXhjbHVzaXZlTWF4ISksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLmV4Y2x1c2l2ZU1heCcsIFwiVmFsdWUgbXVzdCBiZSBzdHJpY3RseSBsZXNzIHRoYW4gezB9LlwiLCBleGNsdXNpdmVNYXgpXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBleGNsdXNpdmVNaW4gIT09IHVuZGVmaW5lZCAmJiAocHJvcC5taW5pbXVtID09PSB1bmRlZmluZWQgfHwgZXhjbHVzaXZlTWluID49IHByb3AubWluaW11bSksXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBudW1iZXIpID0+IHZhbHVlID4gZXhjbHVzaXZlTWluISksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLmV4Y2x1c2l2ZU1pbicsIFwiVmFsdWUgbXVzdCBiZSBzdHJpY3RseSBncmVhdGVyIHRoYW4gezB9LlwiLCBleGNsdXNpdmVNaW4pXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBwcm9wLm1heGltdW0gIT09IHVuZGVmaW5lZCAmJiAoZXhjbHVzaXZlTWF4ID09PSB1bmRlZmluZWQgfHwgZXhjbHVzaXZlTWF4ID4gcHJvcC5tYXhpbXVtKSxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IG51bWJlcikgPT4gdmFsdWUgPD0gcHJvcC5tYXhpbXVtISksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLm1heCcsIFwiVmFsdWUgbXVzdCBiZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gezB9LlwiLCBwcm9wLm1heGltdW0pXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBwcm9wLm1pbmltdW0gIT09IHVuZGVmaW5lZCAmJiAoZXhjbHVzaXZlTWluID09PSB1bmRlZmluZWQgfHwgZXhjbHVzaXZlTWluIDwgcHJvcC5taW5pbXVtKSxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IG51bWJlcikgPT4gdmFsdWUgPj0gcHJvcC5taW5pbXVtISksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLm1pbicsIFwiVmFsdWUgbXVzdCBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gezB9LlwiLCBwcm9wLm1pbmltdW0pXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBwcm9wLm11bHRpcGxlT2YgIT09IHVuZGVmaW5lZCxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IG51bWJlcikgPT4gdmFsdWUgJSBwcm9wLm11bHRpcGxlT2YhID09PSAwKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMubXVsdGlwbGVPZicsIFwiVmFsdWUgbXVzdCBiZSBhIG11bHRpcGxlIG9mIHswfS5cIiwgcHJvcC5tdWx0aXBsZU9mKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogaXNJbnRlZ3JhbCxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IG51bWJlcikgPT4gdmFsdWUgJSAxID09PSAwKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuZXhwZWN0ZWRJbnRlZ2VyJywgXCJWYWx1ZSBtdXN0IGJlIGFuIGludGVnZXIuXCIpXG5cdFx0fSxcblx0XS5maWx0ZXIodmFsaWRhdGlvbiA9PiB2YWxpZGF0aW9uLmVuYWJsZWQpO1xufVxuXG5mdW5jdGlvbiBnZXRBcnJheVZhbGlkYXRvcihwcm9wOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKTogKCh2YWx1ZTogYW55KSA9PiAoc3RyaW5nIHwgbnVsbCkpIHwgbnVsbCB7XG5cdGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcyAmJiAhQXJyYXkuaXNBcnJheShwcm9wLml0ZW1zKSkge1xuXHRcdGNvbnN0IHByb3BJdGVtcyA9IHByb3AuaXRlbXM7XG5cdFx0aWYgKHByb3BJdGVtcyAmJiAhQXJyYXkuaXNBcnJheShwcm9wSXRlbXMudHlwZSkpIHtcblx0XHRcdGNvbnN0IHdpdGhRdW90ZXMgPSAoczogc3RyaW5nKSA9PiBgJ2AgKyBzICsgYCdgO1xuXHRcdFx0cmV0dXJuIHZhbHVlID0+IHtcblx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG1lc3NhZ2UgPSAnJztcblxuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSArPSBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLmFycmF5SW5jb3JyZWN0VHlwZScsICdJbmNvcnJlY3QgdHlwZS4gRXhwZWN0ZWQgYW4gYXJyYXkuJyk7XG5cdFx0XHRcdFx0bWVzc2FnZSArPSAnXFxuJztcblx0XHRcdFx0XHRyZXR1cm4gbWVzc2FnZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFycmF5VmFsdWUgPSB2YWx1ZSBhcyB1bmtub3duW107XG5cdFx0XHRcdGlmIChwcm9wLnVuaXF1ZUl0ZW1zKSB7XG5cdFx0XHRcdFx0aWYgKG5ldyBTZXQoYXJyYXlWYWx1ZSkuc2l6ZSA8IGFycmF5VmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlICs9IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuc3RyaW5nQXJyYXlVbmlxdWVJdGVtcycsICdBcnJheSBoYXMgZHVwbGljYXRlIGl0ZW1zJyk7XG5cdFx0XHRcdFx0XHRtZXNzYWdlICs9ICdcXG4nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwcm9wLm1pbkl0ZW1zICYmIGFycmF5VmFsdWUubGVuZ3RoIDwgcHJvcC5taW5JdGVtcykge1xuXHRcdFx0XHRcdG1lc3NhZ2UgKz0gbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5zdHJpbmdBcnJheU1pbkl0ZW0nLCAnQXJyYXkgbXVzdCBoYXZlIGF0IGxlYXN0IHswfSBpdGVtcycsIHByb3AubWluSXRlbXMpO1xuXHRcdFx0XHRcdG1lc3NhZ2UgKz0gJ1xcbic7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocHJvcC5tYXhJdGVtcyAmJiBhcnJheVZhbHVlLmxlbmd0aCA+IHByb3AubWF4SXRlbXMpIHtcblx0XHRcdFx0XHRtZXNzYWdlICs9IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuc3RyaW5nQXJyYXlNYXhJdGVtJywgJ0FycmF5IG11c3QgaGF2ZSBhdCBtb3N0IHswfSBpdGVtcycsIHByb3AubWF4SXRlbXMpO1xuXHRcdFx0XHRcdG1lc3NhZ2UgKz0gJ1xcbic7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocHJvcEl0ZW1zLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0aWYgKCFpc1N0cmluZ0FycmF5KGFycmF5VmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlICs9IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuc3RyaW5nQXJyYXlJbmNvcnJlY3RUeXBlJywgJ0luY29ycmVjdCB0eXBlLiBFeHBlY3RlZCBhIHN0cmluZyBhcnJheS4nKTtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgKz0gJ1xcbic7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbWVzc2FnZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIHByb3BJdGVtcy5wYXR0ZXJuID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGF0dGVyblJlZ2V4ID0gdG9SZWdFeHAocHJvcEl0ZW1zLnBhdHRlcm4pO1xuXHRcdFx0XHRcdFx0YXJyYXlWYWx1ZS5mb3JFYWNoKHYgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXBhdHRlcm5SZWdleC50ZXN0KHYpKSB7XG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZSArPVxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcEl0ZW1zLnBhdHRlcm5FcnJvck1lc3NhZ2UgfHxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3ZhbGlkYXRpb25zLnN0cmluZ0FycmF5SXRlbVBhdHRlcm4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnVmFsdWUgezB9IG11c3QgbWF0Y2ggcmVnZXggezF9LicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHdpdGhRdW90ZXModiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHdpdGhRdW90ZXMocHJvcEl0ZW1zLnBhdHRlcm4hKVxuXHRcdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvcEl0ZW1zRW51bSA9IHByb3BJdGVtcy5lbnVtO1xuXHRcdFx0XHRcdGlmIChwcm9wSXRlbXNFbnVtKSB7XG5cdFx0XHRcdFx0XHRhcnJheVZhbHVlLmZvckVhY2godiA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChwcm9wSXRlbXNFbnVtLmluZGV4T2YodikgPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZSArPSBubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0XHQndmFsaWRhdGlvbnMuc3RyaW5nQXJyYXlJdGVtRW51bScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnVmFsdWUgezB9IGlzIG5vdCBvbmUgb2YgezF9Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHdpdGhRdW90ZXModiksXG5cdFx0XHRcdFx0XHRcdFx0XHQnWycgKyBwcm9wSXRlbXNFbnVtLm1hcCh3aXRoUXVvdGVzKS5qb2luKCcsICcpICsgJ10nXG5cdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlICs9ICdcXG4nO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJvcEl0ZW1zLnR5cGUgPT09ICdpbnRlZ2VyJyB8fCBwcm9wSXRlbXMudHlwZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRhcnJheVZhbHVlLmZvckVhY2godiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBnZXRFcnJvcnNGb3JTY2hlbWEocHJvcEl0ZW1zLCB2KTtcblx0XHRcdFx0XHRcdGlmIChlcnJvck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSArPSBgJHt2fTogJHtlcnJvck1lc3NhZ2V9XFxuYDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBtZXNzYWdlO1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0T2JqZWN0VmFsaWRhdG9yKHByb3A6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiAoKHZhbHVlOiBhbnkpID0+IChzdHJpbmcgfCBudWxsKSkgfCBudWxsIHtcblx0aWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcpIHtcblx0XHRjb25zdCB7IHByb3BlcnRpZXMsIHBhdHRlcm5Qcm9wZXJ0aWVzLCBhZGRpdGlvbmFsUHJvcGVydGllcywgcHJvcGVydHlOYW1lcyB9ID0gcHJvcDtcblx0XHRyZXR1cm4gdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0bGV0IHByb3BlcnR5TmFtZXNFcnJvclNob3duID0gZmFsc2U7XG5cblx0XHRcdGlmICghaXNPYmplY3QodmFsdWUpKSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMub2JqZWN0SW5jb3JyZWN0VHlwZScsICdJbmNvcnJlY3QgdHlwZS4gRXhwZWN0ZWQgYW4gb2JqZWN0LicpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdE9iamVjdC5rZXlzKHZhbHVlKS5mb3JFYWNoKChrZXk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSB2YWx1ZVtrZXldO1xuXG5cdFx0XHRcdFx0Ly8gVmFsaWRhdGUgcHJvcGVydHlOYW1lcy5wYXR0ZXJuIC0gc2hvdyBlcnJvciBtZXNzYWdlIG9uY2Vcblx0XHRcdFx0XHRpZiAocHJvcGVydHlOYW1lcz8ucGF0dGVybiAmJiAhcHJvcGVydHlOYW1lc0Vycm9yU2hvd24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhdHRlcm5SZWdleCA9IHRvUmVnRXhwKHByb3BlcnR5TmFtZXMucGF0dGVybik7XG5cdFx0XHRcdFx0XHRpZiAoIXBhdHRlcm5SZWdleC50ZXN0KGtleSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gcHJvcGVydHlOYW1lcy5wYXR0ZXJuRXJyb3JNZXNzYWdlIHx8XG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5wcm9wZXJ0eU5hbWVQYXR0ZXJuJywgJ1Byb3BlcnR5IG5hbWUgbXVzdCBtYXRjaCBwYXR0ZXJuIGB7MH1gLicsIHByb3BlcnR5TmFtZXMucGF0dGVybik7XG5cdFx0XHRcdFx0XHRcdGVycm9ycy5wdXNoKGVycm9yTWVzc2FnZSArICdcXG4nKTtcblx0XHRcdFx0XHRcdFx0cHJvcGVydHlOYW1lc0Vycm9yU2hvd24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChwcm9wZXJ0aWVzICYmIGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBnZXRFcnJvcnNGb3JTY2hlbWEocHJvcGVydGllc1trZXldLCBkYXRhKTtcblx0XHRcdFx0XHRcdGlmIChlcnJvck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3JzLnB1c2goYCR7a2V5fTogJHtlcnJvck1lc3NhZ2V9XFxuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHBhdHRlcm5Qcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gaW4gcGF0dGVyblByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKFJlZ0V4cChwYXR0ZXJuKS50ZXN0KGtleSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBnZXRFcnJvcnNGb3JTY2hlbWEocGF0dGVyblByb3BlcnRpZXNbcGF0dGVybl0sIGRhdGEpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChlcnJvck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGVycm9ycy5wdXNoKGAke2tleX06ICR7ZXJyb3JNZXNzYWdlfVxcbmApO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoYWRkaXRpb25hbFByb3BlcnRpZXMgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRlcnJvcnMucHVzaChubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLm9iamVjdFBhdHRlcm4nLCAnUHJvcGVydHkgezB9IGlzIG5vdCBhbGxvd2VkLlxcbicsIGtleSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZ2V0RXJyb3JzRm9yU2NoZW1hKGFkZGl0aW9uYWxQcm9wZXJ0aWVzLCBkYXRhKTtcblx0XHRcdFx0XHRcdGlmIChlcnJvck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3JzLnB1c2goYCR7a2V5fTogJHtlcnJvck1lc3NhZ2V9XFxuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVycm9ycy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHByb3AuZXJyb3JNZXNzYWdlID8gW3Byb3AuZXJyb3JNZXNzYWdlLCAuLi5lcnJvcnNdLmpvaW4oJyAnKSA6IGVycm9ycy5qb2luKCcgJyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAnJztcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogVmFsaWRhdGVzIGEgc2luZ2xlIHByb3BlcnR5IG5hbWUgYWdhaW5zdCB0aGUgcHJvcGVydHlOYW1lcy5wYXR0ZXJuIHNjaGVtYS5cbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUga2V5IGlzIHZhbGlkLCBmYWxzZSBvdGhlcndpc2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVByb3BlcnR5TmFtZShwcm9wZXJ0eU5hbWVzOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hWydwcm9wZXJ0eU5hbWVzJ10sIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICghcHJvcGVydHlOYW1lcz8ucGF0dGVybikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IHBhdHRlcm5SZWdleCA9IHRvUmVnRXhwKHByb3BlcnR5TmFtZXMucGF0dGVybik7XG5cdHJldHVybiBwYXR0ZXJuUmVnZXgudGVzdChrZXkpO1xufVxuXG5mdW5jdGlvbiBnZXRFcnJvcnNGb3JTY2hlbWEocHJvcGVydHlTY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIGRhdGE6IGFueSk6IHN0cmluZyB8IG51bGwge1xuXHRjb25zdCB2YWxpZGF0b3IgPSBjcmVhdGVWYWxpZGF0b3IocHJvcGVydHlTY2hlbWEpO1xuXHRjb25zdCBlcnJvck1lc3NhZ2UgPSB2YWxpZGF0b3IoZGF0YSk7XG5cdHJldHVybiBlcnJvck1lc3Nh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
