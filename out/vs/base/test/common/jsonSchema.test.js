import assert from "assert";
import { getCompressedContent } from "../../common/jsonSchema.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON Schema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getCompressedContent 1", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          description: "a",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        e: {
          type: "object",
          description: "e",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          type: "object",
          description: "a",
          properties: {
            b: {
              $ref: "#/$defs/_0"
            }
          }
        },
        e: {
          type: "object",
          description: "e",
          properties: {
            b: {
              $ref: "#/$defs/_0"
            }
          }
        }
      },
      $defs: {
        "_0": {
          type: "object",
          properties: {
            c: {
              type: "object",
              properties: {
                d: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
  test("getCompressedContent 2", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        e: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          $ref: "#/$defs/_0"
        },
        e: {
          $ref: "#/$defs/_0"
        }
      },
      $defs: {
        "_0": {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
  test("getCompressedContent 3", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          oneOf: [
            {
              allOf: [
                {
                  properties: {
                    name: {
                      type: "string"
                    },
                    description: {
                      type: "string"
                    }
                  }
                },
                {
                  properties: {
                    street: {
                      type: "string"
                    }
                  }
                }
              ]
            },
            {
              allOf: [
                {
                  properties: {
                    name: {
                      type: "string"
                    },
                    description: {
                      type: "string"
                    }
                  }
                },
                {
                  properties: {
                    river: {
                      type: "string"
                    }
                  }
                }
              ]
            },
            {
              allOf: [
                {
                  properties: {
                    name: {
                      type: "string"
                    },
                    description: {
                      type: "string"
                    }
                  }
                },
                {
                  properties: {
                    mountain: {
                      type: "string"
                    }
                  }
                }
              ]
            }
          ]
        },
        b: {
          type: "object",
          properties: {
            street: {
              properties: {
                street: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      "type": "object",
      "properties": {
        "a": {
          "type": "object",
          "oneOf": [
            {
              "allOf": [
                {
                  "$ref": "#/$defs/_0"
                },
                {
                  "$ref": "#/$defs/_1"
                }
              ]
            },
            {
              "allOf": [
                {
                  "$ref": "#/$defs/_0"
                },
                {
                  "properties": {
                    "river": {
                      "type": "string"
                    }
                  }
                }
              ]
            },
            {
              "allOf": [
                {
                  "$ref": "#/$defs/_0"
                },
                {
                  "properties": {
                    "mountain": {
                      "type": "string"
                    }
                  }
                }
              ]
            }
          ]
        },
        "b": {
          "type": "object",
          "properties": {
            "street": {
              "$ref": "#/$defs/_1"
            }
          }
        }
      },
      "$defs": {
        "_0": {
          "properties": {
            "name": {
              "type": "string"
            },
            "description": {
              "type": "string"
            }
          }
        },
        "_1": {
          "properties": {
            "street": {
              "type": "string"
            }
          }
        }
      }
    };
    const actual = getCompressedContent(schema);
    assert.deepEqual(actual, JSON.stringify(expected));
  });
  test("getCompressedContent 4", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        e: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        f: {
          type: "object",
          properties: {
            d: {
              type: "string"
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          $ref: "#/$defs/_0"
        },
        e: {
          $ref: "#/$defs/_0"
        },
        f: {
          $ref: "#/$defs/_1"
        }
      },
      $defs: {
        "_0": {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  $ref: "#/$defs/_1"
                }
              }
            }
          }
        },
        "_1": {
          type: "object",
          properties: {
            d: {
              type: "string"
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
  test("getCompressedContent 5", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "array",
          items: {
            type: "object",
            properties: {
              c: {
                type: "object",
                properties: {
                  d: {
                    type: "string"
                  }
                }
              }
            }
          }
        },
        e: {
          type: "array",
          items: {
            type: "object",
            properties: {
              c: {
                type: "object",
                properties: {
                  d: {
                    type: "string"
                  }
                }
              }
            }
          }
        },
        f: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        g: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: {
                    d: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const expected = {
      type: "object",
      properties: {
        a: {
          $ref: "#/$defs/_0"
        },
        e: {
          $ref: "#/$defs/_0"
        },
        f: {
          $ref: "#/$defs/_1"
        },
        g: {
          $ref: "#/$defs/_1"
        }
      },
      $defs: {
        "_0": {
          type: "array",
          items: {
            $ref: "#/$defs/_2"
          }
        },
        "_1": {
          type: "object",
          properties: {
            b: {
              $ref: "#/$defs/_2"
            }
          }
        },
        "_2": {
          type: "object",
          properties: {
            c: {
              type: "object",
              properties: {
                d: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    };
    assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vanNvblNjaGVtYS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGdldENvbXByZXNzZWRDb250ZW50LCBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnSlNPTiBTY2hlbWEnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZ2V0Q29tcHJlc3NlZENvbnRlbnQgMScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYScsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnZScsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBleHBlY3RlZDogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYScsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2UnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzAnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0JGRlZnM6IHtcblx0XHRcdFx0J18wJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwRXF1YWwoZ2V0Q29tcHJlc3NlZENvbnRlbnQoc2NoZW1hKSwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29tcHJlc3NlZENvbnRlbnQgMicsICgpID0+IHtcblxuXHRcdGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRhOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzAnXG5cblx0XHRcdFx0fSxcblx0XHRcdFx0ZToge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0JGRlZnM6IHtcblx0XHRcdFx0J18wJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcEVxdWFsKGdldENvbXByZXNzZWRDb250ZW50KHNjaGVtYSksIEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbXByZXNzZWRDb250ZW50IDMnLCAoKSA9PiB7XG5cblxuXHRcdGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGFsbE9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHN0cmVldDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhbGxPZjogW1xuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyaXZlcjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhbGxPZjogW1xuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRtb3VudGFpbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0c3RyZWV0OiB7XG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRzdHJlZXQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2EnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQnb25lT2YnOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdhbGxPZic6IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy8kZGVmcy9fMSdcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdhbGxPZic6IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdyaXZlcic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdhbGxPZic6IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdtb3VudGFpbic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQnc3RyZWV0Jzoge1xuXHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjLyRkZWZzL18xJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCckZGVmcyc6IHtcblx0XHRcdFx0J18wJzoge1xuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J25hbWUnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdfMSc6IHtcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCdzdHJlZXQnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gZ2V0Q29tcHJlc3NlZENvbnRlbnQoc2NoZW1hKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbCwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29tcHJlc3NlZENvbnRlbnQgNCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBleHBlY3RlZDogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18wJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzAnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGY6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMSdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCRkZWZzOiB7XG5cdFx0XHRcdCdfMCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzEnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnXzEnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwRXF1YWwoZ2V0Q29tcHJlc3NlZENvbnRlbnQoc2NoZW1hKSwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29tcHJlc3NlZENvbnRlbnQgNScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YToge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Zjoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGc6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRiOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Yzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRhOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzAnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGU6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMCdcblx0XHRcdFx0fSxcblx0XHRcdFx0Zjoge1xuXHRcdFx0XHRcdCRyZWY6ICcjLyRkZWZzL18xJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzEnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQkZGVmczoge1xuXHRcdFx0XHQnXzAnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0JHJlZjogJyMvJGRlZnMvXzInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnXzEnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Yjoge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy8kZGVmcy9fMidcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdfMic6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRjOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcEVxdWFsKGdldENvbXByZXNzZWRDb250ZW50KHNjaGVtYSksIEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsNEJBQXlDO0FBQ2xELFNBQVMsK0NBQStDO0FBRXhELE1BQU0sZUFBZSxNQUFNO0FBRTFCLDBDQUF3QztBQUV4QyxPQUFLLDBCQUEwQixNQUFNO0FBRXBDLFVBQU0sU0FBc0I7QUFBQSxNQUMzQixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxHQUFHO0FBQUEsVUFDRixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixZQUFZO0FBQUEsWUFDWCxHQUFHO0FBQUEsY0FDRixNQUFNO0FBQUEsY0FDTixZQUFZO0FBQUEsZ0JBQ1gsR0FBRztBQUFBLGtCQUNGLE1BQU07QUFBQSxrQkFDTixZQUFZO0FBQUEsb0JBQ1gsR0FBRztBQUFBLHNCQUNGLE1BQU07QUFBQSxvQkFDUDtBQUFBLGtCQUNEO0FBQUEsZ0JBQ0Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxHQUFHO0FBQUEsVUFDRixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixZQUFZO0FBQUEsWUFDWCxHQUFHO0FBQUEsY0FDRixNQUFNO0FBQUEsY0FDTixZ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
