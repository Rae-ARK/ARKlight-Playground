import { newWriteableStream, listenStream } from "../../../../base/common/stream.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { importAMDNodeModule } from "../../../../amdX.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { coalesce } from "../../../../base/common/arrays.js";
const UTF8 = "utf8";
const UTF8_with_bom = "utf8bom";
const UTF16be = "utf16be";
const UTF16le = "utf16le";
function isUTFEncoding(encoding) {
  return [UTF8, UTF8_with_bom, UTF16be, UTF16le].some((utfEncoding) => utfEncoding === encoding);
}
const UTF16be_BOM = [254, 255];
const UTF16le_BOM = [255, 254];
const UTF8_BOM = [239, 187, 191];
const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512;
const NO_ENCODING_GUESS_MIN_BYTES = 512;
const AUTO_ENCODING_GUESS_MIN_BYTES = 512 * 8;
const AUTO_ENCODING_GUESS_MAX_BYTES = 512 * 128;
var DecodeStreamErrorKind = /* @__PURE__ */ ((DecodeStreamErrorKind2) => {
  DecodeStreamErrorKind2[DecodeStreamErrorKind2["STREAM_IS_BINARY"] = 1] = "STREAM_IS_BINARY";
  return DecodeStreamErrorKind2;
})(DecodeStreamErrorKind || {});
class DecodeStreamError extends Error {
  constructor(message, decodeStreamErrorKind) {
    super(message);
    this.decodeStreamErrorKind = decodeStreamErrorKind;
  }
}
class DecoderStream {
  constructor(iconvLiteDecoder) {
    this.iconvLiteDecoder = iconvLiteDecoder;
  }
  /**
   * This stream will only load iconv-lite lazily if the encoding
   * is not UTF-8. This ensures that for most common cases we do
   * not pay the price of loading the module from disk.
   *
   * We still need to be careful when converting UTF-8 to a string
   * though because we read the file in chunks of Buffer and thus
   * need to decode it via TextDecoder helper that is available
   * in browser and node.js environments.
   */
  static async create(encoding) {
    let decoder = void 0;
    if (encoding !== UTF8) {
      const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
      decoder = iconv.getDecoder(toNodeEncoding(encoding));
    } else {
      const utf8TextDecoder = new TextDecoder();
      decoder = {
        write(buffer) {
          return utf8TextDecoder.decode(buffer, {
            // Signal to TextDecoder that potentially more data is coming
            // and that we are calling `decode` in the end to consume any
            // remainders
            stream: true
          });
        },
        end() {
          return utf8TextDecoder.decode();
        }
      };
    }
    return new DecoderStream(decoder);
  }
  write(buffer) {
    return this.iconvLiteDecoder.write(buffer);
  }
  end() {
    return this.iconvLiteDecoder.end();
  }
}
function toDecodeStream(source, options) {
  const minBytesRequiredForDetection = options.minBytesRequiredForDetection ?? (options.guessEncoding ? AUTO_ENCODING_GUESS_MIN_BYTES : NO_ENCODING_GUESS_MIN_BYTES);
  return new Promise((resolve, reject) => {
    const target = newWriteableStream((strings) => strings.join(""));
    const bufferedChunks = [];
    let bytesBuffered = 0;
    let decoder = void 0;
    const cts = new CancellationTokenSource();
    const createDecoder = async () => {
      try {
        const detected = await detectEncodingFromBuffer({
          buffer: VSBuffer.concat(bufferedChunks),
          bytesRead: bytesBuffered
        }, options.guessEncoding, options.candidateGuessEncodings);
        if (detected.seemsBinary && options.acceptTextOnly) {
          throw new DecodeStreamError("Stream is binary but only text is accepted for decoding", 1 /* STREAM_IS_BINARY */);
        }
        detected.encoding = await options.overwriteEncoding(detected.encoding);
        decoder = await DecoderStream.create(detected.encoding);
        const decoded = decoder.write(VSBuffer.concat(bufferedChunks).buffer);
        target.write(decoded);
        bufferedChunks.length = 0;
        bytesBuffered = 0;
        resolve({
          stream: target,
          detected
        });
      } catch (error) {
        cts.cancel();
        target.destroy();
        reject(error);
      }
    };
    listenStream(source, {
      onData: async (chunk) => {
        if (decoder) {
          target.write(decoder.write(chunk.buffer));
        } else {
          bufferedChunks.push(chunk);
          bytesBuffered += chunk.byteLength;
          if (bytesBuffered >= minBytesRequiredForDetection) {
            source.pause();
            await createDecoder();
            setTimeout(() => source.resume());
          }
        }
      },
      onError: (error) => target.error(error),
      // simply forward to target
      onEnd: async () => {
        if (!decoder) {
          await createDecoder();
        }
        target.end(decoder?.end());
      }
    }, cts.token);
  });
}
async function toEncodeReadable(readable, encoding, options) {
  const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
  const encoder = iconv.getEncoder(toNodeEncoding(encoding), options);
  let bytesWritten = false;
  let done = false;
  return {
    read() {
      if (done) {
        return null;
      }
      const chunk = readable.read();
      if (typeof chunk !== "string") {
        done = true;
        if (!bytesWritten && options?.addBOM) {
          switch (encoding) {
            case UTF8:
            case UTF8_with_bom:
              return VSBuffer.wrap(Uint8Array.from(UTF8_BOM));
            case UTF16be:
              return VSBuffer.wrap(Uint8Array.from(UTF16be_BOM));
            case UTF16le:
              return VSBuffer.wrap(Uint8Array.from(UTF16le_BOM));
          }
        }
        const leftovers = encoder.end();
        if (leftovers && leftovers.length > 0) {
          bytesWritten = true;
          return VSBuffer.wrap(leftovers);
        }
        return null;
      }
      bytesWritten = true;
      return VSBuffer.wrap(encoder.write(chunk));
    }
  };
}
async function encodingExists(encoding) {
  const iconv = await importAMDNodeModule("@vscode/iconv-lite-umd", "lib/iconv-lite-umd.js");
  return iconv.encodingExists(toNodeEncoding(encoding));
}
function toNodeEncoding(enc) {
  if (enc === UTF8_with_bom || enc === null) {
    return UTF8;
  }
  return enc;
}
function detectEncodingByBOMFromBuffer(buffer, bytesRead) {
  if (!buffer || bytesRead < UTF16be_BOM.length) {
    return null;
  }
  const b0 = buffer.readUInt8(0);
  const b1 = buffer.readUInt8(1);
  if (b0 === UTF16be_BOM[0] && b1 === UTF16be_BOM[1]) {
    return UTF16be;
  }
  if (b0 === UTF16le_BOM[0] && b1 === UTF16le_BOM[1]) {
    return UTF16le;
  }
  if (bytesRead < UTF8_BOM.length) {
    return null;
  }
  const b2 = buffer.readUInt8(2);
  if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
    return UTF8_with_bom;
  }
  return null;
}
const IGNORE_ENCODINGS = ["ascii", "utf-16", "utf-32"];
async function guessEncodingByBuffer(buffer, candidateGuessEncodings) {
  const jschardet = await importAMDNodeModule("jschardet", "dist/jschardet.min.js");
  const limitedBuffer = buffer.slice(0, AUTO_ENCODING_GUESS_MAX_BYTES);
  const binaryString = encodeLatin1(limitedBuffer.buffer);
  if (candidateGuessEncodings) {
    candidateGuessEncodings = coalesce(candidateGuessEncodings.map((e) => toJschardetEncoding(e)));
    if (candidateGuessEncodings.length === 0) {
      candidateGuessEncodings = void 0;
    }
  }
  let guessed;
  try {
    guessed = jschardet.detect(binaryString, candidateGuessEncodings ? { detectEncodings: candidateGuessEncodings } : void 0);
  } catch (error) {
    return null;
  }
  if (!guessed?.encoding) {
    return null;
  }
  const enc = guessed.encoding.toLowerCase();
  if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
    return null;
  }
  return toIconvLiteEncoding(guessed.encoding);
}
const JSCHARDET_TO_ICONV_ENCODINGS = {
  "ibm866": "cp866",
  "big5": "cp950"
};
function normalizeEncoding(encodingName) {
  return encodingName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function toIconvLiteEncoding(encodingName) {
  const normalizedEncodingName = normalizeEncoding(encodingName);
  const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];
  return mapped || normalizedEncodingName;
}
function toJschardetEncoding(encodingName) {
  const normalizedEncodingName = normalizeEncoding(encodingName);
  const mapped = GUESSABLE_ENCODINGS[normalizedEncodingName];
  return mapped ? mapped.guessableName : void 0;
}
function encodeLatin1(buffer) {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i]);
  }
  return result;
}
function toCanonicalName(enc) {
  switch (enc) {
    case "shiftjis":
      return "shift-jis";
    case "utf16le":
      return "utf-16le";
    case "utf16be":
      return "utf-16be";
    case "big5hkscs":
      return "big5-hkscs";
    case "eucjp":
      return "euc-jp";
    case "euckr":
      return "euc-kr";
    case "koi8r":
      return "koi8-r";
    case "koi8u":
      return "koi8-u";
    case "macroman":
      return "x-mac-roman";
    case "utf8bom":
      return "utf8";
    default: {
      const m = enc.match(/windows(\d+)/);
      if (m) {
        return "windows-" + m[1];
      }
      return enc;
    }
  }
}
function detectEncodingFromBuffer({ buffer, bytesRead }, autoGuessEncoding, candidateGuessEncodings) {
  let encoding = detectEncodingByBOMFromBuffer(buffer, bytesRead);
  let seemsBinary = false;
  if (encoding !== UTF16be && encoding !== UTF16le && buffer) {
    let couldBeUTF16LE = true;
    let couldBeUTF16BE = true;
    let containsZeroByte = false;
    for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
      const isEndian = i % 2 === 1;
      const isZeroByte = buffer.readUInt8(i) === 0;
      if (isZeroByte) {
        containsZeroByte = true;
      }
      if (couldBeUTF16LE && (isEndian && !isZeroByte || !isEndian && isZeroByte)) {
        couldBeUTF16LE = false;
      }
      if (couldBeUTF16BE && (isEndian && isZeroByte || !isEndian && !isZeroByte)) {
        couldBeUTF16BE = false;
      }
      if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
        break;
      }
    }
    if (containsZeroByte) {
      if (couldBeUTF16LE) {
        encoding = UTF16le;
      } else if (couldBeUTF16BE) {
        encoding = UTF16be;
      } else {
        seemsBinary = true;
      }
    }
  }
  if (autoGuessEncoding && !seemsBinary && !encoding && buffer) {
    return guessEncodingByBuffer(buffer.slice(0, bytesRead), candidateGuessEncodings).then((guessedEncoding) => {
      return {
        seemsBinary: false,
        encoding: guessedEncoding
      };
    });
  }
  return { seemsBinary, encoding };
}
const SUPPORTED_ENCODINGS = {
  utf8: {
    labelLong: "UTF-8",
    labelShort: "UTF-8",
    order: 1,
    alias: "utf8bom",
    guessableName: "UTF-8"
  },
  utf8bom: {
    labelLong: "UTF-8 with BOM",
    labelShort: "UTF-8 with BOM",
    encodeOnly: true,
    order: 2,
    alias: "utf8"
  },
  utf16le: {
    labelLong: "UTF-16 LE",
    labelShort: "UTF-16 LE",
    order: 3,
    guessableName: "UTF-16LE"
  },
  utf16be: {
    labelLong: "UTF-16 BE",
    labelShort: "UTF-16 BE",
    order: 4,
    guessableName: "UTF-16BE"
  },
  windows1252: {
    labelLong: "Western (Windows 1252)",
    labelShort: "Windows 1252",
    order: 5,
    guessableName: "windows-1252"
  },
  iso88591: {
    labelLong: "Western (ISO 8859-1)",
    labelShort: "ISO 8859-1",
    order: 6
  },
  iso88593: {
    labelLong: "Western (ISO 8859-3)",
    labelShort: "ISO 8859-3",
    order: 7
  },
  iso885915: {
    labelLong: "Western (ISO 8859-15)",
    labelShort: "ISO 8859-15",
    order: 8
  },
  macroman: {
    labelLong: "Western (Mac Roman)",
    labelShort: "Mac Roman",
    order: 9
  },
  cp437: {
    labelLong: "DOS (CP 437)",
    labelShort: "CP437",
    order: 10
  },
  windows1256: {
    labelLong: "Arabic (Windows 1256)",
    labelShort: "Windows 1256",
    order: 11
  },
  iso88596: {
    labelLong: "Arabic (ISO 8859-6)",
    labelShort: "ISO 8859-6",
    order: 12
  },
  windows1257: {
    labelLong: "Baltic (Windows 1257)",
    labelShort: "Windows 1257",
    order: 13
  },
  iso88594: {
    labelLong: "Baltic (ISO 8859-4)",
    labelShort: "ISO 8859-4",
    order: 14
  },
  iso885914: {
    labelLong: "Celtic (ISO 8859-14)",
    labelShort: "ISO 8859-14",
    order: 15
  },
  windows1250: {
    labelLong: "Central European (Windows 1250)",
    labelShort: "Windows 1250",
    order: 16,
    guessableName: "windows-1250"
  },
  iso88592: {
    labelLong: "Central European (ISO 8859-2)",
    labelShort: "ISO 8859-2",
    order: 17,
    guessableName: "ISO-8859-2"
  },
  cp852: {
    labelLong: "Central European (CP 852)",
    labelShort: "CP 852",
    order: 18
  },
  windows1251: {
    labelLong: "Cyrillic (Windows 1251)",
    labelShort: "Windows 1251",
    order: 19,
    guessableName: "windows-1251"
  },
  cp866: {
    labelLong: "Cyrillic (CP 866)",
    labelShort: "CP 866",
    order: 20,
    guessableName: "IBM866"
  },
  cp1125: {
    labelLong: "Cyrillic (CP 1125)",
    labelShort: "CP 1125",
    order: 21,
    guessableName: "IBM1125"
  },
  iso88595: {
    labelLong: "Cyrillic (ISO 8859-5)",
    labelShort: "ISO 8859-5",
    order: 22,
    guessableName: "ISO-8859-5"
  },
  koi8r: {
    labelLong: "Cyrillic (KOI8-R)",
    labelShort: "KOI8-R",
    order: 23,
    guessableName: "KOI8-R"
  },
  koi8u: {
    labelLong: "Cyrillic (KOI8-U)",
    labelShort: "KOI8-U",
    order: 24
  },
  iso885913: {
    labelLong: "Estonian (ISO 8859-13)",
    labelShort: "ISO 8859-13",
    order: 25
  },
  windows1253: {
    labelLong: "Greek (Windows 1253)",
    labelShort: "Windows 1253",
    order: 26,
    guessableName: "windows-1253"
  },
  iso88597: {
    labelLong: "Greek (ISO 8859-7)",
    labelShort: "ISO 8859-7",
    order: 27,
    guessableName: "ISO-8859-7"
  },
  windows1255: {
    labelLong: "Hebrew (Windows 1255)",
    labelShort: "Windows 1255",
    order: 28,
    guessableName: "windows-1255"
  },
  iso88598: {
    labelLong: "Hebrew (ISO 8859-8)",
    labelShort: "ISO 8859-8",
    order: 29,
    guessableName: "ISO-8859-8"
  },
  iso885910: {
    labelLong: "Nordic (ISO 8859-10)",
    labelShort: "ISO 8859-10",
    order: 30
  },
  iso885916: {
    labelLong: "Romanian (ISO 8859-16)",
    labelShort: "ISO 8859-16",
    order: 31
  },
  windows1254: {
    labelLong: "Turkish (Windows 1254)",
    labelShort: "Windows 1254",
    order: 32
  },
  iso88599: {
    labelLong: "Turkish (ISO 8859-9)",
    labelShort: "ISO 8859-9",
    order: 33
  },
  cp857: {
    labelLong: "Turkish (CP 857)",
    labelShort: "CP 857",
    order: 34
  },
  windows1258: {
    labelLong: "Vietnamese (Windows 1258)",
    labelShort: "Windows 1258",
    order: 35
  },
  gbk: {
    labelLong: "Simplified Chinese (GBK)",
    labelShort: "GBK",
    order: 36
  },
  gb18030: {
    labelLong: "Simplified Chinese (GB18030)",
    labelShort: "GB18030",
    order: 37
  },
  cp950: {
    labelLong: "Traditional Chinese (Big5)",
    labelShort: "Big5",
    order: 38,
    guessableName: "Big5"
  },
  big5hkscs: {
    labelLong: "Traditional Chinese (Big5-HKSCS)",
    labelShort: "Big5-HKSCS",
    order: 39
  },
  shiftjis: {
    labelLong: "Japanese (Shift JIS)",
    labelShort: "Shift JIS",
    order: 40,
    guessableName: "SHIFT_JIS"
  },
  eucjp: {
    labelLong: "Japanese (EUC-JP)",
    labelShort: "EUC-JP",
    order: 41,
    guessableName: "EUC-JP"
  },
  euckr: {
    labelLong: "Korean (EUC-KR)",
    labelShort: "EUC-KR",
    order: 42,
    guessableName: "EUC-KR"
  },
  windows874: {
    labelLong: "Thai (Windows 874)",
    labelShort: "Windows 874",
    order: 43
  },
  iso885911: {
    labelLong: "Latin/Thai (ISO 8859-11)",
    labelShort: "ISO 8859-11",
    order: 44
  },
  koi8ru: {
    labelLong: "Cyrillic (KOI8-RU)",
    labelShort: "KOI8-RU",
    order: 45
  },
  koi8t: {
    labelLong: "Tajik (KOI8-T)",
    labelShort: "KOI8-T",
    order: 46
  },
  gb2312: {
    labelLong: "Simplified Chinese (GB 2312)",
    labelShort: "GB 2312",
    order: 47,
    guessableName: "GB2312"
  },
  cp865: {
    labelLong: "Nordic DOS (CP 865)",
    labelShort: "CP 865",
    order: 48
  },
  cp850: {
    labelLong: "Western European DOS (CP 850)",
    labelShort: "CP 850",
    order: 49
  }
};
const GUESSABLE_ENCODINGS = (() => {
  const guessableEncodings = {};
  for (const encoding in SUPPORTED_ENCODINGS) {
    if (SUPPORTED_ENCODINGS[encoding].guessableName) {
      guessableEncodings[encoding] = SUPPORTED_ENCODINGS[encoding];
    }
  }
  return guessableEncodings;
})();
export {
  DecodeStreamError,
  DecodeStreamErrorKind,
  GUESSABLE_ENCODINGS,
  SUPPORTED_ENCODINGS,
  UTF16be,
  UTF16be_BOM,
  UTF16le,
  UTF16le_BOM,
  UTF8,
  UTF8_BOM,
  UTF8_with_bom,
  detectEncodingByBOMFromBuffer,
  detectEncodingFromBuffer,
  encodingExists,
  isUTFEncoding,
  toCanonicalName,
  toDecodeStream,
  toEncodeReadable,
  toNodeEncoding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vZW5jb2RpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSZWFkYWJsZSwgUmVhZGFibGVTdHJlYW0sIG5ld1dyaXRlYWJsZVN0cmVhbSwgbGlzdGVuU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxuZXhwb3J0IGNvbnN0IFVURjggPSAndXRmOCc7XG5leHBvcnQgY29uc3QgVVRGOF93aXRoX2JvbSA9ICd1dGY4Ym9tJztcbmV4cG9ydCBjb25zdCBVVEYxNmJlID0gJ3V0ZjE2YmUnO1xuZXhwb3J0IGNvbnN0IFVURjE2bGUgPSAndXRmMTZsZSc7XG5cbmV4cG9ydCB0eXBlIFVURl9FTkNPRElORyA9IHR5cGVvZiBVVEY4IHwgdHlwZW9mIFVURjhfd2l0aF9ib20gfCB0eXBlb2YgVVRGMTZiZSB8IHR5cGVvZiBVVEYxNmxlO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNVVEZFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nKTogZW5jb2RpbmcgaXMgVVRGX0VOQ09ESU5HIHtcblx0cmV0dXJuIFtVVEY4LCBVVEY4X3dpdGhfYm9tLCBVVEYxNmJlLCBVVEYxNmxlXS5zb21lKHV0ZkVuY29kaW5nID0+IHV0ZkVuY29kaW5nID09PSBlbmNvZGluZyk7XG59XG5cbmV4cG9ydCBjb25zdCBVVEYxNmJlX0JPTSA9IFsweEZFLCAweEZGXTtcbmV4cG9ydCBjb25zdCBVVEYxNmxlX0JPTSA9IFsweEZGLCAweEZFXTtcbmV4cG9ydCBjb25zdCBVVEY4X0JPTSA9IFsweEVGLCAweEJCLCAweEJGXTtcblxuY29uc3QgWkVST19CWVRFX0RFVEVDVElPTl9CVUZGRVJfTUFYX0xFTiA9IDUxMjsgXHQvLyBudW1iZXIgb2YgYnl0ZXMgdG8gbG9vayBhdCB0byBkZWNpZGUgYWJvdXQgYSBmaWxlIGJlaW5nIGJpbmFyeSBvciBub3RcbmNvbnN0IE5PX0VOQ09ESU5HX0dVRVNTX01JTl9CWVRFUyA9IDUxMjsgXHRcdFx0Ly8gd2hlbiBub3QgYXV0byBndWVzc2luZyB0aGUgZW5jb2RpbmcsIHNtYWxsIG51bWJlciBvZiBieXRlcyBhcmUgZW5vdWdoXG5jb25zdCBBVVRPX0VOQ09ESU5HX0dVRVNTX01JTl9CWVRFUyA9IDUxMiAqIDg7IFx0XHQvLyB3aXRoIGF1dG8gZ3Vlc3Npbmcgd2Ugd2FudCBhIGxvdCBtb3JlIGNvbnRlbnQgdG8gYmUgcmVhZCBmb3IgZ3Vlc3NpbmdcbmNvbnN0IEFVVE9fRU5DT0RJTkdfR1VFU1NfTUFYX0JZVEVTID0gNTEyICogMTI4OyBcdC8vIHNldCBhbiB1cHBlciBsaW1pdCBmb3IgdGhlIG51bWJlciBvZiBieXRlcyB3ZSBwYXNzIG9uIHRvIGpzY2hhcmRldFxuXG5leHBvcnQgaW50ZXJmYWNlIElEZWNvZGVTdHJlYW1PcHRpb25zIHtcblx0YWNjZXB0VGV4dE9ubHk6IGJvb2xlYW47XG5cdGd1ZXNzRW5jb2Rpbmc6IGJvb2xlYW47XG5cdGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBzdHJpbmdbXTtcblx0bWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbj86IG51bWJlcjtcblxuXHRvdmVyd3JpdGVFbmNvZGluZyhkZXRlY3RlZEVuY29kaW5nOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZWNvZGVTdHJlYW1SZXN1bHQge1xuXHRzdHJlYW06IFJlYWRhYmxlU3RyZWFtPHN0cmluZz47XG5cdGRldGVjdGVkOiBJRGV0ZWN0ZWRFbmNvZGluZ1Jlc3VsdDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRGVjb2RlU3RyZWFtRXJyb3JLaW5kIHtcblxuXHQvKipcblx0ICogRXJyb3IgaW5kaWNhdGluZyB0aGF0IHRoZSBzdHJlYW0gaXMgYmluYXJ5IGV2ZW5cblx0ICogdGhvdWdoIGBhY2NlcHRUZXh0T25seWAgd2FzIHNwZWNpZmllZC5cblx0ICovXG5cdFNUUkVBTV9JU19CSU5BUlkgPSAxXG59XG5cbmV4cG9ydCBjbGFzcyBEZWNvZGVTdHJlYW1FcnJvciBleHRlbmRzIEVycm9yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtZXNzYWdlOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZGVjb2RlU3RyZWFtRXJyb3JLaW5kOiBEZWNvZGVTdHJlYW1FcnJvcktpbmRcblx0KSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGVjb2RlclN0cmVhbSB7XG5cdHdyaXRlKGJ1ZmZlcjogVWludDhBcnJheSk6IHN0cmluZztcblx0ZW5kKCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgRGVjb2RlclN0cmVhbSBpbXBsZW1lbnRzIElEZWNvZGVyU3RyZWFtIHtcblxuXHQvKipcblx0ICogVGhpcyBzdHJlYW0gd2lsbCBvbmx5IGxvYWQgaWNvbnYtbGl0ZSBsYXppbHkgaWYgdGhlIGVuY29kaW5nXG5cdCAqIGlzIG5vdCBVVEYtOC4gVGhpcyBlbnN1cmVzIHRoYXQgZm9yIG1vc3QgY29tbW9uIGNhc2VzIHdlIGRvXG5cdCAqIG5vdCBwYXkgdGhlIHByaWNlIG9mIGxvYWRpbmcgdGhlIG1vZHVsZSBmcm9tIGRpc2suXG5cdCAqXG5cdCAqIFdlIHN0aWxsIG5lZWQgdG8gYmUgY2FyZWZ1bCB3aGVuIGNvbnZlcnRpbmcgVVRGLTggdG8gYSBzdHJpbmdcblx0ICogdGhvdWdoIGJlY2F1c2Ugd2UgcmVhZCB0aGUgZmlsZSBpbiBjaHVua3Mgb2YgQnVmZmVyIGFuZCB0aHVzXG5cdCAqIG5lZWQgdG8gZGVjb2RlIGl0IHZpYSBUZXh0RGVjb2RlciBoZWxwZXIgdGhhdCBpcyBhdmFpbGFibGVcblx0ICogaW4gYnJvd3NlciBhbmQgbm9kZS5qcyBlbnZpcm9ubWVudHMuXG5cdCAqL1xuXHRzdGF0aWMgYXN5bmMgY3JlYXRlKGVuY29kaW5nOiBzdHJpbmcpOiBQcm9taXNlPERlY29kZXJTdHJlYW0+IHtcblx0XHRsZXQgZGVjb2RlcjogSURlY29kZXJTdHJlYW0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGVuY29kaW5nICE9PSBVVEY4KSB7XG5cdFx0XHRjb25zdCBpY29udiA9IGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHZzY29kZS9pY29udi1saXRlLXVtZCcpPignQHZzY29kZS9pY29udi1saXRlLXVtZCcsICdsaWIvaWNvbnYtbGl0ZS11bWQuanMnKTtcblx0XHRcdGRlY29kZXIgPSBpY29udi5nZXREZWNvZGVyKHRvTm9kZUVuY29kaW5nKGVuY29kaW5nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHV0ZjhUZXh0RGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXHRcdFx0ZGVjb2RlciA9IHtcblx0XHRcdFx0d3JpdGUoYnVmZmVyOiBVaW50OEFycmF5KTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gdXRmOFRleHREZWNvZGVyLmRlY29kZShidWZmZXIsIHtcblx0XHRcdFx0XHRcdC8vIFNpZ25hbCB0byBUZXh0RGVjb2RlciB0aGF0IHBvdGVudGlhbGx5IG1vcmUgZGF0YSBpcyBjb21pbmdcblx0XHRcdFx0XHRcdC8vIGFuZCB0aGF0IHdlIGFyZSBjYWxsaW5nIGBkZWNvZGVgIGluIHRoZSBlbmQgdG8gY29uc3VtZSBhbnlcblx0XHRcdFx0XHRcdC8vIHJlbWFpbmRlcnNcblx0XHRcdFx0XHRcdHN0cmVhbTogdHJ1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGVuZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRcdHJldHVybiB1dGY4VGV4dERlY29kZXIuZGVjb2RlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBEZWNvZGVyU3RyZWFtKGRlY29kZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihwcml2YXRlIGljb252TGl0ZURlY29kZXI6IElEZWNvZGVyU3RyZWFtKSB7IH1cblxuXHR3cml0ZShidWZmZXI6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmljb252TGl0ZURlY29kZXIud3JpdGUoYnVmZmVyKTtcblx0fVxuXG5cdGVuZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmljb252TGl0ZURlY29kZXIuZW5kKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvRGVjb2RlU3RyZWFtKHNvdXJjZTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9uczogSURlY29kZVN0cmVhbU9wdGlvbnMpOiBQcm9taXNlPElEZWNvZGVTdHJlYW1SZXN1bHQ+IHtcblx0Y29uc3QgbWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbiA9IG9wdGlvbnMubWluQnl0ZXNSZXF1aXJlZEZvckRldGVjdGlvbiA/PyAob3B0aW9ucy5ndWVzc0VuY29kaW5nID8gQVVUT19FTkNPRElOR19HVUVTU19NSU5fQllURVMgOiBOT19FTkNPRElOR19HVUVTU19NSU5fQllURVMpO1xuXG5cdHJldHVybiBuZXcgUHJvbWlzZTxJRGVjb2RlU3RyZWFtUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3V3JpdGVhYmxlU3RyZWFtPHN0cmluZz4oc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oJycpKTtcblxuXHRcdGNvbnN0IGJ1ZmZlcmVkQ2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0bGV0IGJ5dGVzQnVmZmVyZWQgPSAwO1xuXG5cdFx0bGV0IGRlY29kZXI6IElEZWNvZGVyU3RyZWFtIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRjb25zdCBjcmVhdGVEZWNvZGVyID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblxuXHRcdFx0XHQvLyBkZXRlY3QgZW5jb2RpbmcgZnJvbSBidWZmZXJcblx0XHRcdFx0Y29uc3QgZGV0ZWN0ZWQgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoe1xuXHRcdFx0XHRcdGJ1ZmZlcjogVlNCdWZmZXIuY29uY2F0KGJ1ZmZlcmVkQ2h1bmtzKSxcblx0XHRcdFx0XHRieXRlc1JlYWQ6IGJ5dGVzQnVmZmVyZWRcblx0XHRcdFx0fSwgb3B0aW9ucy5ndWVzc0VuY29kaW5nLCBvcHRpb25zLmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzKTtcblxuXHRcdFx0XHQvLyB0aHJvdyBlYXJseSBpZiB0aGUgc291cmNlIHNlZW1zIGJpbmFyeSBhbmRcblx0XHRcdFx0Ly8gd2UgYXJlIGluc3RydWN0ZWQgdG8gb25seSBhY2NlcHQgdGV4dFxuXHRcdFx0XHRpZiAoZGV0ZWN0ZWQuc2VlbXNCaW5hcnkgJiYgb3B0aW9ucy5hY2NlcHRUZXh0T25seSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBEZWNvZGVTdHJlYW1FcnJvcignU3RyZWFtIGlzIGJpbmFyeSBidXQgb25seSB0ZXh0IGlzIGFjY2VwdGVkIGZvciBkZWNvZGluZycsIERlY29kZVN0cmVhbUVycm9yS2luZC5TVFJFQU1fSVNfQklOQVJZKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGVuc3VyZSB0byByZXNwZWN0IG92ZXJ3cml0ZSBvZiBlbmNvZGluZ1xuXHRcdFx0XHRkZXRlY3RlZC5lbmNvZGluZyA9IGF3YWl0IG9wdGlvbnMub3ZlcndyaXRlRW5jb2RpbmcoZGV0ZWN0ZWQuZW5jb2RpbmcpO1xuXG5cdFx0XHRcdC8vIGRlY29kZSBhbmQgd3JpdGUgYnVmZmVyZWQgY29udGVudFxuXHRcdFx0XHRkZWNvZGVyID0gYXdhaXQgRGVjb2RlclN0cmVhbS5jcmVhdGUoZGV0ZWN0ZWQuZW5jb2RpbmcpO1xuXHRcdFx0XHRjb25zdCBkZWNvZGVkID0gZGVjb2Rlci53cml0ZShWU0J1ZmZlci5jb25jYXQoYnVmZmVyZWRDaHVua3MpLmJ1ZmZlcik7XG5cdFx0XHRcdHRhcmdldC53cml0ZShkZWNvZGVkKTtcblxuXHRcdFx0XHRidWZmZXJlZENodW5rcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRieXRlc0J1ZmZlcmVkID0gMDtcblxuXHRcdFx0XHQvLyBzaWduYWwgdG8gdGhlIG91dHNpZGUgb3VyIGRldGVjdGVkIGVuY29kaW5nIGFuZCBmaW5hbCBkZWNvZGVyIHN0cmVhbVxuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRzdHJlYW06IHRhcmdldCxcblx0XHRcdFx0XHRkZXRlY3RlZFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdFx0Ly8gU3RvcCBoYW5kbGluZyBhbnl0aGluZyBmcm9tIHRoZSBzb3VyY2UgYW5kIHRhcmdldFxuXHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdHRhcmdldC5kZXN0cm95KCk7XG5cblx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGlzdGVuU3RyZWFtKHNvdXJjZSwge1xuXHRcdFx0b25EYXRhOiBhc3luYyBjaHVuayA9PiB7XG5cblx0XHRcdFx0Ly8gaWYgdGhlIGRlY29kZXIgaXMgcmVhZHksIHdlIGp1c3Qgd3JpdGUgZGlyZWN0bHlcblx0XHRcdFx0aWYgKGRlY29kZXIpIHtcblx0XHRcdFx0XHR0YXJnZXQud3JpdGUoZGVjb2Rlci53cml0ZShjaHVuay5idWZmZXIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG90aGVyd2lzZSB3ZSBuZWVkIHRvIGJ1ZmZlciB0aGUgZGF0YSB1bnRpbCB0aGUgc3RyZWFtIGlzIHJlYWR5XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGJ1ZmZlcmVkQ2h1bmtzLnB1c2goY2h1bmspO1xuXHRcdFx0XHRcdGJ5dGVzQnVmZmVyZWQgKz0gY2h1bmsuYnl0ZUxlbmd0aDtcblxuXHRcdFx0XHRcdC8vIGJ1ZmZlcmVkIGVub3VnaCBkYXRhIGZvciBlbmNvZGluZyBkZXRlY3Rpb24sIGNyZWF0ZSBzdHJlYW1cblx0XHRcdFx0XHRpZiAoYnl0ZXNCdWZmZXJlZCA+PSBtaW5CeXRlc1JlcXVpcmVkRm9yRGV0ZWN0aW9uKSB7XG5cblx0XHRcdFx0XHRcdC8vIHBhdXNlIHN0cmVhbSBoZXJlIHVudGlsIHRoZSBkZWNvZGVyIGlzIHJlYWR5XG5cdFx0XHRcdFx0XHRzb3VyY2UucGF1c2UoKTtcblxuXHRcdFx0XHRcdFx0YXdhaXQgY3JlYXRlRGVjb2RlcigpO1xuXG5cdFx0XHRcdFx0XHQvLyByZXN1bWUgc3RyZWFtIG5vdyB0aGF0IGRlY29kZXIgaXMgcmVhZHkgYnV0XG5cdFx0XHRcdFx0XHQvLyBvdXRzaWRlIG9mIHRoaXMgc3RhY2sgdG8gcmVkdWNlIHJlY3Vyc2lvblxuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBzb3VyY2UucmVzdW1lKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uRXJyb3I6IGVycm9yID0+IHRhcmdldC5lcnJvcihlcnJvciksIC8vIHNpbXBseSBmb3J3YXJkIHRvIHRhcmdldFxuXHRcdFx0b25FbmQ6IGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHQvLyB3ZSB3ZXJlIHN0aWxsIHdhaXRpbmcgZm9yIGRhdGEgdG8gZG8gdGhlIGVuY29kaW5nXG5cdFx0XHRcdC8vIGRldGVjdGlvbi4gdGh1cywgd3JhcCB1cCBzdGFydGluZyB0aGUgc3RyZWFtIGV2ZW5cblx0XHRcdFx0Ly8gd2l0aG91dCBhbGwgdGhlIGRhdGEgdG8gZ2V0IHRoaW5ncyBnb2luZ1xuXHRcdFx0XHRpZiAoIWRlY29kZXIpIHtcblx0XHRcdFx0XHRhd2FpdCBjcmVhdGVEZWNvZGVyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBlbmQgdGhlIHRhcmdldCB3aXRoIHRoZSByZW1haW5kZXJzIG9mIHRoZSBkZWNvZGVyXG5cdFx0XHRcdHRhcmdldC5lbmQoZGVjb2Rlcj8uZW5kKCkpO1xuXHRcdFx0fVxuXHRcdH0sIGN0cy50b2tlbik7XG5cdH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdG9FbmNvZGVSZWFkYWJsZShyZWFkYWJsZTogUmVhZGFibGU8c3RyaW5nPiwgZW5jb2Rpbmc6IHN0cmluZywgb3B0aW9ucz86IHsgYWRkQk9NPzogYm9vbGVhbiB9KTogUHJvbWlzZTxWU0J1ZmZlclJlYWRhYmxlPiB7XG5cdGNvbnN0IGljb252ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJyk+KCdAdnNjb2RlL2ljb252LWxpdGUtdW1kJywgJ2xpYi9pY29udi1saXRlLXVtZC5qcycpO1xuXHRjb25zdCBlbmNvZGVyID0gaWNvbnYuZ2V0RW5jb2Rlcih0b05vZGVFbmNvZGluZyhlbmNvZGluZyksIG9wdGlvbnMpO1xuXG5cdGxldCBieXRlc1dyaXR0ZW4gPSBmYWxzZTtcblx0bGV0IGRvbmUgPSBmYWxzZTtcblxuXHRyZXR1cm4ge1xuXHRcdHJlYWQoKSB7XG5cdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2h1bmsgPSByZWFkYWJsZS5yZWFkKCk7XG5cdFx0XHRpZiAodHlwZW9mIGNodW5rICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRkb25lID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyBJZiB3ZSBhcmUgaW5zdHJ1Y3RlZCB0byBhZGQgYSBCT00gYnV0IHdlIGRldGVjdCB0aGF0IG5vXG5cdFx0XHRcdC8vIGJ5dGVzIGhhdmUgYmVlbiB3cml0dGVuLCB3ZSBtdXN0IGVuc3VyZSB0byByZXR1cm4gdGhlIEJPTVxuXHRcdFx0XHQvLyBvdXJzZWx2ZXMgc28gdGhhdCB3ZSBjb21wbHkgd2l0aCB0aGUgY29udHJhY3QuXG5cdFx0XHRcdGlmICghYnl0ZXNXcml0dGVuICYmIG9wdGlvbnM/LmFkZEJPTSkge1xuXHRcdFx0XHRcdHN3aXRjaCAoZW5jb2RpbmcpIHtcblx0XHRcdFx0XHRcdGNhc2UgVVRGODpcblx0XHRcdFx0XHRcdGNhc2UgVVRGOF93aXRoX2JvbTpcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAoVWludDhBcnJheS5mcm9tKFVURjhfQk9NKSk7XG5cdFx0XHRcdFx0XHRjYXNlIFVURjE2YmU6XG5cdFx0XHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKFVpbnQ4QXJyYXkuZnJvbShVVEYxNmJlX0JPTSkpO1xuXHRcdFx0XHRcdFx0Y2FzZSBVVEYxNmxlOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChVaW50OEFycmF5LmZyb20oVVRGMTZsZV9CT00pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsZWZ0b3ZlcnMgPSBlbmNvZGVyLmVuZCgpO1xuXHRcdFx0XHRpZiAobGVmdG92ZXJzICYmIGxlZnRvdmVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Ynl0ZXNXcml0dGVuID0gdHJ1ZTtcblxuXHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKGxlZnRvdmVycyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Ynl0ZXNXcml0dGVuID0gdHJ1ZTtcblxuXHRcdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAoZW5jb2Rlci53cml0ZShjaHVuaykpO1xuXHRcdH1cblx0fTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuY29kaW5nRXhpc3RzKGVuY29kaW5nOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgaWNvbnYgPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnKT4oJ0B2c2NvZGUvaWNvbnYtbGl0ZS11bWQnLCAnbGliL2ljb252LWxpdGUtdW1kLmpzJyk7XG5cblx0cmV0dXJuIGljb252LmVuY29kaW5nRXhpc3RzKHRvTm9kZUVuY29kaW5nKGVuY29kaW5nKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b05vZGVFbmNvZGluZyhlbmM6IHN0cmluZyB8IG51bGwpOiBzdHJpbmcge1xuXHRpZiAoZW5jID09PSBVVEY4X3dpdGhfYm9tIHx8IGVuYyA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBVVEY4OyAvLyBpY29udiBkb2VzIG5vdCBkaXN0aW5ndWlzaCBVVEYgOCB3aXRoIG9yIHdpdGhvdXQgQk9NLCBzbyB3ZSBuZWVkIHRvIGhlbHAgaXRcblx0fVxuXG5cdHJldHVybiBlbmM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RFbmNvZGluZ0J5Qk9NRnJvbUJ1ZmZlcihidWZmZXI6IFZTQnVmZmVyIHwgbnVsbCwgYnl0ZXNSZWFkOiBudW1iZXIpOiB0eXBlb2YgVVRGOF93aXRoX2JvbSB8IHR5cGVvZiBVVEYxNmxlIHwgdHlwZW9mIFVURjE2YmUgfCBudWxsIHtcblx0aWYgKCFidWZmZXIgfHwgYnl0ZXNSZWFkIDwgVVRGMTZiZV9CT00ubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBiMCA9IGJ1ZmZlci5yZWFkVUludDgoMCk7XG5cdGNvbnN0IGIxID0gYnVmZmVyLnJlYWRVSW50OCgxKTtcblxuXHQvLyBVVEYtMTYgQkVcblx0aWYgKGIwID09PSBVVEYxNmJlX0JPTVswXSAmJiBiMSA9PT0gVVRGMTZiZV9CT01bMV0pIHtcblx0XHRyZXR1cm4gVVRGMTZiZTtcblx0fVxuXG5cdC8vIFVURi0xNiBMRVxuXHRpZiAoYjAgPT09IFVURjE2bGVfQk9NWzBdICYmIGIxID09PSBVVEYxNmxlX0JPTVsxXSkge1xuXHRcdHJldHVybiBVVEYxNmxlO1xuXHR9XG5cblx0aWYgKGJ5dGVzUmVhZCA8IFVURjhfQk9NLmxlbmd0aCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgYjIgPSBidWZmZXIucmVhZFVJbnQ4KDIpO1xuXG5cdC8vIFVURi04XG5cdGlmIChiMCA9PT0gVVRGOF9CT01bMF0gJiYgYjEgPT09IFVURjhfQk9NWzFdICYmIGIyID09PSBVVEY4X0JPTVsyXSkge1xuXHRcdHJldHVybiBVVEY4X3dpdGhfYm9tO1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbi8vIHdlIGV4cGxpY2l0bHkgaWdub3JlIGEgc3BlY2lmaWMgc2V0IG9mIGVuY29kaW5ncyBmcm9tIGF1dG8gZ3Vlc3Npbmdcbi8vIC0gQVNDSUk6IHdlIG5ldmVyIHdhbnQgdGhpcyBlbmNvZGluZyAobW9zdCBVVEYtOCBmaWxlcyB3b3VsZCBoYXBwaWx5IGRldGVjdCBhc1xuLy8gICAgICAgICAgQVNDSUkgZmlsZXMgYW5kIHRoZW4geW91IGNvdWxkIG5vdCB0eXBlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzIGFueW1vcmUpXG4vLyAtIFVURi0xNjogd2UgaGF2ZSBvdXIgb3duIGRldGVjdGlvbiBsb2dpYyBmb3IgVVRGLTE2XG4vLyAtIFVURi0zMjogd2UgZG8gbm90IHN1cHBvcnQgdGhpcyBlbmNvZGluZyBpbiBWU0NvZGVcbmNvbnN0IElHTk9SRV9FTkNPRElOR1MgPSBbJ2FzY2lpJywgJ3V0Zi0xNicsICd1dGYtMzInXTtcblxuLyoqXG4gKiBHdWVzc2VzIHRoZSBlbmNvZGluZyBmcm9tIGJ1ZmZlci5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ3Vlc3NFbmNvZGluZ0J5QnVmZmVyKGJ1ZmZlcjogVlNCdWZmZXIsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzPzogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0Y29uc3QganNjaGFyZGV0ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdqc2NoYXJkZXQnKT4oJ2pzY2hhcmRldCcsICdkaXN0L2pzY2hhcmRldC5taW4uanMnKTtcblxuXHQvLyBlbnN1cmUgdG8gbGltaXQgYnVmZmVyIGZvciBndWVzc2luZyBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL2FhZHNtL2pzY2hhcmRldC9pc3N1ZXMvNTNcblx0Y29uc3QgbGltaXRlZEJ1ZmZlciA9IGJ1ZmZlci5zbGljZSgwLCBBVVRPX0VOQ09ESU5HX0dVRVNTX01BWF9CWVRFUyk7XG5cblx0Ly8gYmVmb3JlIGd1ZXNzaW5nIGpzY2hhcmRldCBjYWxscyB0b1N0cmluZygnYmluYXJ5Jykgb24gaW5wdXQgaWYgaXQgaXMgYSBCdWZmZXIsXG5cdC8vIHNpbmNlIHdlIGFyZSB1c2luZyBpdCBpbnNpZGUgYnJvd3NlciBlbnZpcm9ubWVudCBhcyB3ZWxsIHdlIGRvIGNvbnZlcnNpb24gb3Vyc2VsdmVzXG5cdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hYWRzbS9qc2NoYXJkZXQvYmxvYi92Mi4xLjEvc3JjL2luZGV4LmpzI0wzNi1MNDBcblx0Y29uc3QgYmluYXJ5U3RyaW5nID0gZW5jb2RlTGF0aW4xKGxpbWl0ZWRCdWZmZXIuYnVmZmVyKTtcblxuXHQvLyBlbnN1cmUgdG8gY29udmVydCBjYW5kaWRhdGUgZW5jb2RpbmdzIHRvIGpzY2hhcmRldCBlbmNvZGluZyBuYW1lcyBpZiBwcm92aWRlZFxuXHRpZiAoY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MpIHtcblx0XHRjYW5kaWRhdGVHdWVzc0VuY29kaW5ncyA9IGNvYWxlc2NlKGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzLm1hcChlID0+IHRvSnNjaGFyZGV0RW5jb2RpbmcoZSkpKTtcblx0XHRpZiAoY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjYW5kaWRhdGVHdWVzc0VuY29kaW5ncyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRsZXQgZ3Vlc3NlZDogeyBlbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0Z3Vlc3NlZCA9IGpzY2hhcmRldC5kZXRlY3QoYmluYXJ5U3RyaW5nLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5ncyA/IHsgZGV0ZWN0RW5jb2RpbmdzOiBjYW5kaWRhdGVHdWVzc0VuY29kaW5ncyB9IDogdW5kZWZpbmVkKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRyZXR1cm4gbnVsbDsgLy8ganNjaGFyZGV0IHRocm93cyBmb3IgdW5rbm93biBlbmNvZGluZ3MgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzk5MjgpXG5cdH1cblxuXHRpZiAoIWd1ZXNzZWQ/LmVuY29kaW5nKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBlbmMgPSBndWVzc2VkLmVuY29kaW5nLnRvTG93ZXJDYXNlKCk7XG5cdGlmICgwIDw9IElHTk9SRV9FTkNPRElOR1MuaW5kZXhPZihlbmMpKSB7XG5cdFx0cmV0dXJuIG51bGw7IC8vIHNlZSBjb21tZW50IGFib3ZlIHdoeSB3ZSBpZ25vcmUgc29tZSBlbmNvZGluZ3Ncblx0fVxuXG5cdHJldHVybiB0b0ljb252TGl0ZUVuY29kaW5nKGd1ZXNzZWQuZW5jb2RpbmcpO1xufVxuXG5jb25zdCBKU0NIQVJERVRfVE9fSUNPTlZfRU5DT0RJTkdTOiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcblx0J2libTg2Nic6ICdjcDg2NicsXG5cdCdiaWc1JzogJ2NwOTUwJ1xufTtcblxuZnVuY3Rpb24gbm9ybWFsaXplRW5jb2RpbmcoZW5jb2RpbmdOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gZW5jb2RpbmdOYW1lLnJlcGxhY2UoL1teYS16QS1aMC05XS9nLCAnJykudG9Mb3dlckNhc2UoKTtcbn1cblxuZnVuY3Rpb24gdG9JY29udkxpdGVFbmNvZGluZyhlbmNvZGluZ05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG5vcm1hbGl6ZWRFbmNvZGluZ05hbWUgPSBub3JtYWxpemVFbmNvZGluZyhlbmNvZGluZ05hbWUpO1xuXHRjb25zdCBtYXBwZWQgPSBKU0NIQVJERVRfVE9fSUNPTlZfRU5DT0RJTkdTW25vcm1hbGl6ZWRFbmNvZGluZ05hbWVdO1xuXG5cdHJldHVybiBtYXBwZWQgfHwgbm9ybWFsaXplZEVuY29kaW5nTmFtZTtcbn1cblxuZnVuY3Rpb24gdG9Kc2NoYXJkZXRFbmNvZGluZyhlbmNvZGluZ05hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5vcm1hbGl6ZWRFbmNvZGluZ05hbWUgPSBub3JtYWxpemVFbmNvZGluZyhlbmNvZGluZ05hbWUpO1xuXHRjb25zdCBtYXBwZWQgPSBHVUVTU0FCTEVfRU5DT0RJTkdTW25vcm1hbGl6ZWRFbmNvZGluZ05hbWVdO1xuXG5cdHJldHVybiBtYXBwZWQgPyBtYXBwZWQuZ3Vlc3NhYmxlTmFtZSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZW5jb2RlTGF0aW4xKGJ1ZmZlcjogVWludDhBcnJheSk6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBidWZmZXIubGVuZ3RoOyBpKyspIHtcblx0XHRyZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZmZXJbaV0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBUaGUgZW5jb2RpbmdzIHRoYXQgYXJlIGFsbG93ZWQgaW4gYSBzZXR0aW5ncyBmaWxlIGRvbid0IG1hdGNoIHRoZSBjYW5vbmljYWwgZW5jb2RpbmcgbGFiZWxzIHNwZWNpZmllZCBieSBXSEFUV0cuXG4gKiBTZWUgaHR0cHM6Ly9lbmNvZGluZy5zcGVjLndoYXR3Zy5vcmcvI25hbWVzLWFuZC1sYWJlbHNcbiAqIEljb252LWxpdGUgc3RyaXBzIGFsbCBub24tYWxwaGFudW1lcmljIGNoYXJhY3RlcnMsIGJ1dCByaXBncmVwIGRvZXNuJ3QuIEZvciBiYWNrY29tcGF0LCBhbGxvdyB0aGVzZSBsYWJlbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b0Nhbm9uaWNhbE5hbWUoZW5jOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGVuYykge1xuXHRcdGNhc2UgJ3NoaWZ0amlzJzpcblx0XHRcdHJldHVybiAnc2hpZnQtamlzJztcblx0XHRjYXNlICd1dGYxNmxlJzpcblx0XHRcdHJldHVybiAndXRmLTE2bGUnO1xuXHRcdGNhc2UgJ3V0ZjE2YmUnOlxuXHRcdFx0cmV0dXJuICd1dGYtMTZiZSc7XG5cdFx0Y2FzZSAnYmlnNWhrc2NzJzpcblx0XHRcdHJldHVybiAnYmlnNS1oa3Njcyc7XG5cdFx0Y2FzZSAnZXVjanAnOlxuXHRcdFx0cmV0dXJuICdldWMtanAnO1xuXHRcdGNhc2UgJ2V1Y2tyJzpcblx0XHRcdHJldHVybiAnZXVjLWtyJztcblx0XHRjYXNlICdrb2k4cic6XG5cdFx0XHRyZXR1cm4gJ2tvaTgtcic7XG5cdFx0Y2FzZSAna29pOHUnOlxuXHRcdFx0cmV0dXJuICdrb2k4LXUnO1xuXHRcdGNhc2UgJ21hY3JvbWFuJzpcblx0XHRcdHJldHVybiAneC1tYWMtcm9tYW4nO1xuXHRcdGNhc2UgJ3V0Zjhib20nOlxuXHRcdFx0cmV0dXJuICd1dGY4Jztcblx0XHRkZWZhdWx0OiB7XG5cdFx0XHRjb25zdCBtID0gZW5jLm1hdGNoKC93aW5kb3dzKFxcZCspLyk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRyZXR1cm4gJ3dpbmRvd3MtJyArIG1bMV07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBlbmM7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURldGVjdGVkRW5jb2RpbmdSZXN1bHQge1xuXHRlbmNvZGluZzogc3RyaW5nIHwgbnVsbDtcblx0c2VlbXNCaW5hcnk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlYWRSZXN1bHQge1xuXHRidWZmZXI6IFZTQnVmZmVyIHwgbnVsbDtcblx0Ynl0ZXNSZWFkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIocmVhZFJlc3VsdDogSVJlYWRSZXN1bHQsIGF1dG9HdWVzc0VuY29kaW5nPzogZmFsc2UsIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzPzogc3RyaW5nW10pOiBJRGV0ZWN0ZWRFbmNvZGluZ1Jlc3VsdDtcbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIocmVhZFJlc3VsdDogSVJlYWRSZXN1bHQsIGF1dG9HdWVzc0VuY29kaW5nPzogYm9vbGVhbiwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M/OiBzdHJpbmdbXSk6IFByb21pc2U8SURldGVjdGVkRW5jb2RpbmdSZXN1bHQ+O1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcih7IGJ1ZmZlciwgYnl0ZXNSZWFkIH06IElSZWFkUmVzdWx0LCBhdXRvR3Vlc3NFbmNvZGluZz86IGJvb2xlYW4sIGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzPzogc3RyaW5nW10pOiBQcm9taXNlPElEZXRlY3RlZEVuY29kaW5nUmVzdWx0PiB8IElEZXRlY3RlZEVuY29kaW5nUmVzdWx0IHtcblxuXHQvLyBBbHdheXMgZmlyc3QgY2hlY2sgZm9yIEJPTSB0byBmaW5kIG91dCBhYm91dCBlbmNvZGluZ1xuXHRsZXQgZW5jb2RpbmcgPSBkZXRlY3RFbmNvZGluZ0J5Qk9NRnJvbUJ1ZmZlcihidWZmZXIsIGJ5dGVzUmVhZCk7XG5cblx0Ly8gRGV0ZWN0IDAgYnl0ZXMgdG8gc2VlIGlmIGZpbGUgaXMgYmluYXJ5IG9yIFVURi0xNiBMRS9CRVxuXHQvLyB1bmxlc3Mgd2UgYWxyZWFkeSBrbm93IHRoYXQgdGhpcyBmaWxlIGhhcyBhIFVURi0xNiBlbmNvZGluZ1xuXHRsZXQgc2VlbXNCaW5hcnkgPSBmYWxzZTtcblx0aWYgKGVuY29kaW5nICE9PSBVVEYxNmJlICYmIGVuY29kaW5nICE9PSBVVEYxNmxlICYmIGJ1ZmZlcikge1xuXHRcdGxldCBjb3VsZEJlVVRGMTZMRSA9IHRydWU7IC8vIGUuZy4gMHhBQSAweDAwXG5cdFx0bGV0IGNvdWxkQmVVVEYxNkJFID0gdHJ1ZTsgLy8gZS5nLiAweDAwIDB4QUFcblx0XHRsZXQgY29udGFpbnNaZXJvQnl0ZSA9IGZhbHNlO1xuXG5cdFx0Ly8gVGhpcyBpcyBhIHNpbXBsaWZpZWQgZ3Vlc3MgdG8gZGV0ZWN0IFVURi0xNiBCRSBvciBMRSBieSBqdXN0IGNoZWNraW5nIGlmXG5cdFx0Ly8gdGhlIGZpcnN0IDUxMiBieXRlcyBoYXZlIHRoZSAwLWJ5dGUgYXQgYSBzcGVjaWZpYyBsb2NhdGlvbi4gRm9yIFVURi0xNiBMRVxuXHRcdC8vIHRoaXMgd291bGQgYmUgdGhlIG9kZCBieXRlIGluZGV4IGFuZCBmb3IgVVRGLTE2IEJFIHRoZSBldmVuIG9uZS5cblx0XHQvLyBOb3RlOiB0aGlzIGNhbiBwcm9kdWNlIGZhbHNlIHBvc2l0aXZlcyAoYSBiaW5hcnkgZmlsZSB0aGF0IHVzZXMgYSAyLWJ5dGVcblx0XHQvLyBlbmNvZGluZyBvZiB0aGUgc2FtZSBmb3JtYXQgYXMgVVRGLTE2KSBhbmQgZmFsc2UgbmVnYXRpdmVzIChhIFVURi0xNiBmaWxlXG5cdFx0Ly8gdGhhdCBpcyB1c2luZyA0IGJ5dGVzIHRvIGVuY29kZSBhIGNoYXJhY3RlcikuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBieXRlc1JlYWQgJiYgaSA8IFpFUk9fQllURV9ERVRFQ1RJT05fQlVGRkVSX01BWF9MRU47IGkrKykge1xuXHRcdFx0Y29uc3QgaXNFbmRpYW4gPSAoaSAlIDIgPT09IDEpOyAvLyBhc3N1bWUgMi1ieXRlIHNlcXVlbmNlcyB0eXBpY2FsIGZvciBVVEYtMTZcblx0XHRcdGNvbnN0IGlzWmVyb0J5dGUgPSAoYnVmZmVyLnJlYWRVSW50OChpKSA9PT0gMCk7XG5cblx0XHRcdGlmIChpc1plcm9CeXRlKSB7XG5cdFx0XHRcdGNvbnRhaW5zWmVyb0J5dGUgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVVEYtMTYgTEU6IGV4cGVjdCBlLmcuIDB4QUEgMHgwMFxuXHRcdFx0aWYgKGNvdWxkQmVVVEYxNkxFICYmIChpc0VuZGlhbiAmJiAhaXNaZXJvQnl0ZSB8fCAhaXNFbmRpYW4gJiYgaXNaZXJvQnl0ZSkpIHtcblx0XHRcdFx0Y291bGRCZVVURjE2TEUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVVRGLTE2IEJFOiBleHBlY3QgZS5nLiAweDAwIDB4QUFcblx0XHRcdGlmIChjb3VsZEJlVVRGMTZCRSAmJiAoaXNFbmRpYW4gJiYgaXNaZXJvQnl0ZSB8fCAhaXNFbmRpYW4gJiYgIWlzWmVyb0J5dGUpKSB7XG5cdFx0XHRcdGNvdWxkQmVVVEYxNkJFID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJldHVybiBpZiB0aGlzIGlzIG5laXRoZXIgVVRGMTYtTEUgbm9yIFVURjE2LUJFIGFuZCB0aHVzIHRyZWF0IGFzIGJpbmFyeVxuXHRcdFx0aWYgKGlzWmVyb0J5dGUgJiYgIWNvdWxkQmVVVEYxNkxFICYmICFjb3VsZEJlVVRGMTZCRSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgY2FzZSBvZiAwLWJ5dGUgaW5jbHVkZWRcblx0XHRpZiAoY29udGFpbnNaZXJvQnl0ZSkge1xuXHRcdFx0aWYgKGNvdWxkQmVVVEYxNkxFKSB7XG5cdFx0XHRcdGVuY29kaW5nID0gVVRGMTZsZTtcblx0XHRcdH0gZWxzZSBpZiAoY291bGRCZVVURjE2QkUpIHtcblx0XHRcdFx0ZW5jb2RpbmcgPSBVVEYxNmJlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VlbXNCaW5hcnkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEF1dG8gZ3Vlc3MgZW5jb2RpbmcgaWYgY29uZmlndXJlZFxuXHRpZiAoYXV0b0d1ZXNzRW5jb2RpbmcgJiYgIXNlZW1zQmluYXJ5ICYmICFlbmNvZGluZyAmJiBidWZmZXIpIHtcblx0XHRyZXR1cm4gZ3Vlc3NFbmNvZGluZ0J5QnVmZmVyKGJ1ZmZlci5zbGljZSgwLCBieXRlc1JlYWQpLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5ncykudGhlbihndWVzc2VkRW5jb2RpbmcgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c2VlbXNCaW5hcnk6IGZhbHNlLFxuXHRcdFx0XHRlbmNvZGluZzogZ3Vlc3NlZEVuY29kaW5nXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHsgc2VlbXNCaW5hcnksIGVuY29kaW5nIH07XG59XG5cbnR5cGUgRW5jb2RpbmdzTWFwID0geyBbZW5jb2Rpbmc6IHN0cmluZ106IHsgbGFiZWxMb25nOiBzdHJpbmc7IGxhYmVsU2hvcnQ6IHN0cmluZzsgb3JkZXI6IG51bWJlcjsgZW5jb2RlT25seT86IGJvb2xlYW47IGFsaWFzPzogc3RyaW5nOyBndWVzc2FibGVOYW1lPzogc3RyaW5nIH0gfTtcblxuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9FTkNPRElOR1M6IEVuY29kaW5nc01hcCA9IHtcblx0dXRmODoge1xuXHRcdGxhYmVsTG9uZzogJ1VURi04Jyxcblx0XHRsYWJlbFNob3J0OiAnVVRGLTgnLFxuXHRcdG9yZGVyOiAxLFxuXHRcdGFsaWFzOiAndXRmOGJvbScsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ1VURi04J1xuXHR9LFxuXHR1dGY4Ym9tOiB7XG5cdFx0bGFiZWxMb25nOiAnVVRGLTggd2l0aCBCT00nLFxuXHRcdGxhYmVsU2hvcnQ6ICdVVEYtOCB3aXRoIEJPTScsXG5cdFx0ZW5jb2RlT25seTogdHJ1ZSxcblx0XHRvcmRlcjogMixcblx0XHRhbGlhczogJ3V0ZjgnXG5cdH0sXG5cdHV0ZjE2bGU6IHtcblx0XHRsYWJlbExvbmc6ICdVVEYtMTYgTEUnLFxuXHRcdGxhYmVsU2hvcnQ6ICdVVEYtMTYgTEUnLFxuXHRcdG9yZGVyOiAzLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdVVEYtMTZMRSdcblx0fSxcblx0dXRmMTZiZToge1xuXHRcdGxhYmVsTG9uZzogJ1VURi0xNiBCRScsXG5cdFx0bGFiZWxTaG9ydDogJ1VURi0xNiBCRScsXG5cdFx0b3JkZXI6IDQsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ1VURi0xNkJFJ1xuXHR9LFxuXHR3aW5kb3dzMTI1Mjoge1xuXHRcdGxhYmVsTG9uZzogJ1dlc3Rlcm4gKFdpbmRvd3MgMTI1MiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDEyNTInLFxuXHRcdG9yZGVyOiA1LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICd3aW5kb3dzLTEyNTInXG5cdH0sXG5cdGlzbzg4NTkxOiB7XG5cdFx0bGFiZWxMb25nOiAnV2VzdGVybiAoSVNPIDg4NTktMSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0xJyxcblx0XHRvcmRlcjogNlxuXHR9LFxuXHRpc284ODU5Mzoge1xuXHRcdGxhYmVsTG9uZzogJ1dlc3Rlcm4gKElTTyA4ODU5LTMpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktMycsXG5cdFx0b3JkZXI6IDdcblx0fSxcblx0aXNvODg1OTE1OiB7XG5cdFx0bGFiZWxMb25nOiAnV2VzdGVybiAoSVNPIDg4NTktMTUpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktMTUnLFxuXHRcdG9yZGVyOiA4XG5cdH0sXG5cdG1hY3JvbWFuOiB7XG5cdFx0bGFiZWxMb25nOiAnV2VzdGVybiAoTWFjIFJvbWFuKScsXG5cdFx0bGFiZWxTaG9ydDogJ01hYyBSb21hbicsXG5cdFx0b3JkZXI6IDlcblx0fSxcblx0Y3A0Mzc6IHtcblx0XHRsYWJlbExvbmc6ICdET1MgKENQIDQzNyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdDUDQzNycsXG5cdFx0b3JkZXI6IDEwXG5cdH0sXG5cdHdpbmRvd3MxMjU2OiB7XG5cdFx0bGFiZWxMb25nOiAnQXJhYmljIChXaW5kb3dzIDEyNTYpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjU2Jyxcblx0XHRvcmRlcjogMTFcblx0fSxcblx0aXNvODg1OTY6IHtcblx0XHRsYWJlbExvbmc6ICdBcmFiaWMgKElTTyA4ODU5LTYpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktNicsXG5cdFx0b3JkZXI6IDEyXG5cdH0sXG5cdHdpbmRvd3MxMjU3OiB7XG5cdFx0bGFiZWxMb25nOiAnQmFsdGljIChXaW5kb3dzIDEyNTcpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjU3Jyxcblx0XHRvcmRlcjogMTNcblx0fSxcblx0aXNvODg1OTQ6IHtcblx0XHRsYWJlbExvbmc6ICdCYWx0aWMgKElTTyA4ODU5LTQpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktNCcsXG5cdFx0b3JkZXI6IDE0XG5cdH0sXG5cdGlzbzg4NTkxNDoge1xuXHRcdGxhYmVsTG9uZzogJ0NlbHRpYyAoSVNPIDg4NTktMTQpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktMTQnLFxuXHRcdG9yZGVyOiAxNVxuXHR9LFxuXHR3aW5kb3dzMTI1MDoge1xuXHRcdGxhYmVsTG9uZzogJ0NlbnRyYWwgRXVyb3BlYW4gKFdpbmRvd3MgMTI1MCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDEyNTAnLFxuXHRcdG9yZGVyOiAxNixcblx0XHRndWVzc2FibGVOYW1lOiAnd2luZG93cy0xMjUwJ1xuXHR9LFxuXHRpc284ODU5Mjoge1xuXHRcdGxhYmVsTG9uZzogJ0NlbnRyYWwgRXVyb3BlYW4gKElTTyA4ODU5LTIpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktMicsXG5cdFx0b3JkZXI6IDE3LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdJU08tODg1OS0yJ1xuXHR9LFxuXHRjcDg1Mjoge1xuXHRcdGxhYmVsTG9uZzogJ0NlbnRyYWwgRXVyb3BlYW4gKENQIDg1MiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdDUCA4NTInLFxuXHRcdG9yZGVyOiAxOFxuXHR9LFxuXHR3aW5kb3dzMTI1MToge1xuXHRcdGxhYmVsTG9uZzogJ0N5cmlsbGljIChXaW5kb3dzIDEyNTEpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjUxJyxcblx0XHRvcmRlcjogMTksXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ3dpbmRvd3MtMTI1MSdcblx0fSxcblx0Y3A4NjY6IHtcblx0XHRsYWJlbExvbmc6ICdDeXJpbGxpYyAoQ1AgODY2KScsXG5cdFx0bGFiZWxTaG9ydDogJ0NQIDg2NicsXG5cdFx0b3JkZXI6IDIwLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdJQk04NjYnXG5cdH0sXG5cdGNwMTEyNToge1xuXHRcdGxhYmVsTG9uZzogJ0N5cmlsbGljIChDUCAxMTI1KScsXG5cdFx0bGFiZWxTaG9ydDogJ0NQIDExMjUnLFxuXHRcdG9yZGVyOiAyMSxcblx0XHRndWVzc2FibGVOYW1lOiAnSUJNMTEyNSdcblx0fSxcblx0aXNvODg1OTU6IHtcblx0XHRsYWJlbExvbmc6ICdDeXJpbGxpYyAoSVNPIDg4NTktNSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS01Jyxcblx0XHRvcmRlcjogMjIsXG5cdFx0Z3Vlc3NhYmxlTmFtZTogJ0lTTy04ODU5LTUnXG5cdH0sXG5cdGtvaThyOiB7XG5cdFx0bGFiZWxMb25nOiAnQ3lyaWxsaWMgKEtPSTgtUiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdLT0k4LVInLFxuXHRcdG9yZGVyOiAyMyxcblx0XHRndWVzc2FibGVOYW1lOiAnS09JOC1SJ1xuXHR9LFxuXHRrb2k4dToge1xuXHRcdGxhYmVsTG9uZzogJ0N5cmlsbGljIChLT0k4LVUpJyxcblx0XHRsYWJlbFNob3J0OiAnS09JOC1VJyxcblx0XHRvcmRlcjogMjRcblx0fSxcblx0aXNvODg1OTEzOiB7XG5cdFx0bGFiZWxMb25nOiAnRXN0b25pYW4gKElTTyA4ODU5LTEzKScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTEzJyxcblx0XHRvcmRlcjogMjVcblx0fSxcblx0d2luZG93czEyNTM6IHtcblx0XHRsYWJlbExvbmc6ICdHcmVlayAoV2luZG93cyAxMjUzKScsXG5cdFx0bGFiZWxTaG9ydDogJ1dpbmRvd3MgMTI1MycsXG5cdFx0b3JkZXI6IDI2LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICd3aW5kb3dzLTEyNTMnXG5cdH0sXG5cdGlzbzg4NTk3OiB7XG5cdFx0bGFiZWxMb25nOiAnR3JlZWsgKElTTyA4ODU5LTcpJyxcblx0XHRsYWJlbFNob3J0OiAnSVNPIDg4NTktNycsXG5cdFx0b3JkZXI6IDI3LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdJU08tODg1OS03J1xuXHR9LFxuXHR3aW5kb3dzMTI1NToge1xuXHRcdGxhYmVsTG9uZzogJ0hlYnJldyAoV2luZG93cyAxMjU1KScsXG5cdFx0bGFiZWxTaG9ydDogJ1dpbmRvd3MgMTI1NScsXG5cdFx0b3JkZXI6IDI4LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICd3aW5kb3dzLTEyNTUnXG5cdH0sXG5cdGlzbzg4NTk4OiB7XG5cdFx0bGFiZWxMb25nOiAnSGVicmV3IChJU08gODg1OS04KScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTgnLFxuXHRcdG9yZGVyOiAyOSxcblx0XHRndWVzc2FibGVOYW1lOiAnSVNPLTg4NTktOCdcblx0fSxcblx0aXNvODg1OTEwOiB7XG5cdFx0bGFiZWxMb25nOiAnTm9yZGljIChJU08gODg1OS0xMCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0xMCcsXG5cdFx0b3JkZXI6IDMwXG5cdH0sXG5cdGlzbzg4NTkxNjoge1xuXHRcdGxhYmVsTG9uZzogJ1JvbWFuaWFuIChJU08gODg1OS0xNiknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS0xNicsXG5cdFx0b3JkZXI6IDMxXG5cdH0sXG5cdHdpbmRvd3MxMjU0OiB7XG5cdFx0bGFiZWxMb25nOiAnVHVya2lzaCAoV2luZG93cyAxMjU0KScsXG5cdFx0bGFiZWxTaG9ydDogJ1dpbmRvd3MgMTI1NCcsXG5cdFx0b3JkZXI6IDMyXG5cdH0sXG5cdGlzbzg4NTk5OiB7XG5cdFx0bGFiZWxMb25nOiAnVHVya2lzaCAoSVNPIDg4NTktOSknLFxuXHRcdGxhYmVsU2hvcnQ6ICdJU08gODg1OS05Jyxcblx0XHRvcmRlcjogMzNcblx0fSxcblx0Y3A4NTc6IHtcblx0XHRsYWJlbExvbmc6ICdUdXJraXNoIChDUCA4NTcpJyxcblx0XHRsYWJlbFNob3J0OiAnQ1AgODU3Jyxcblx0XHRvcmRlcjogMzRcblx0fSxcblx0d2luZG93czEyNTg6IHtcblx0XHRsYWJlbExvbmc6ICdWaWV0bmFtZXNlIChXaW5kb3dzIDEyNTgpJyxcblx0XHRsYWJlbFNob3J0OiAnV2luZG93cyAxMjU4Jyxcblx0XHRvcmRlcjogMzVcblx0fSxcblx0Z2JrOiB7XG5cdFx0bGFiZWxMb25nOiAnU2ltcGxpZmllZCBDaGluZXNlIChHQkspJyxcblx0XHRsYWJlbFNob3J0OiAnR0JLJyxcblx0XHRvcmRlcjogMzZcblx0fSxcblx0Z2IxODAzMDoge1xuXHRcdGxhYmVsTG9uZzogJ1NpbXBsaWZpZWQgQ2hpbmVzZSAoR0IxODAzMCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdHQjE4MDMwJyxcblx0XHRvcmRlcjogMzdcblx0fSxcblx0Y3A5NTA6IHtcblx0XHRsYWJlbExvbmc6ICdUcmFkaXRpb25hbCBDaGluZXNlIChCaWc1KScsXG5cdFx0bGFiZWxTaG9ydDogJ0JpZzUnLFxuXHRcdG9yZGVyOiAzOCxcblx0XHRndWVzc2FibGVOYW1lOiAnQmlnNSdcblx0fSxcblx0YmlnNWhrc2NzOiB7XG5cdFx0bGFiZWxMb25nOiAnVHJhZGl0aW9uYWwgQ2hpbmVzZSAoQmlnNS1IS1NDUyknLFxuXHRcdGxhYmVsU2hvcnQ6ICdCaWc1LUhLU0NTJyxcblx0XHRvcmRlcjogMzlcblx0fSxcblx0c2hpZnRqaXM6IHtcblx0XHRsYWJlbExvbmc6ICdKYXBhbmVzZSAoU2hpZnQgSklTKScsXG5cdFx0bGFiZWxTaG9ydDogJ1NoaWZ0IEpJUycsXG5cdFx0b3JkZXI6IDQwLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdTSElGVF9KSVMnXG5cdH0sXG5cdGV1Y2pwOiB7XG5cdFx0bGFiZWxMb25nOiAnSmFwYW5lc2UgKEVVQy1KUCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdFVUMtSlAnLFxuXHRcdG9yZGVyOiA0MSxcblx0XHRndWVzc2FibGVOYW1lOiAnRVVDLUpQJ1xuXHR9LFxuXHRldWNrcjoge1xuXHRcdGxhYmVsTG9uZzogJ0tvcmVhbiAoRVVDLUtSKScsXG5cdFx0bGFiZWxTaG9ydDogJ0VVQy1LUicsXG5cdFx0b3JkZXI6IDQyLFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdFVUMtS1InXG5cdH0sXG5cdHdpbmRvd3M4NzQ6IHtcblx0XHRsYWJlbExvbmc6ICdUaGFpIChXaW5kb3dzIDg3NCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdXaW5kb3dzIDg3NCcsXG5cdFx0b3JkZXI6IDQzXG5cdH0sXG5cdGlzbzg4NTkxMToge1xuXHRcdGxhYmVsTG9uZzogJ0xhdGluL1RoYWkgKElTTyA4ODU5LTExKScsXG5cdFx0bGFiZWxTaG9ydDogJ0lTTyA4ODU5LTExJyxcblx0XHRvcmRlcjogNDRcblx0fSxcblx0a29pOHJ1OiB7XG5cdFx0bGFiZWxMb25nOiAnQ3lyaWxsaWMgKEtPSTgtUlUpJyxcblx0XHRsYWJlbFNob3J0OiAnS09JOC1SVScsXG5cdFx0b3JkZXI6IDQ1XG5cdH0sXG5cdGtvaTh0OiB7XG5cdFx0bGFiZWxMb25nOiAnVGFqaWsgKEtPSTgtVCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdLT0k4LVQnLFxuXHRcdG9yZGVyOiA0NlxuXHR9LFxuXHRnYjIzMTI6IHtcblx0XHRsYWJlbExvbmc6ICdTaW1wbGlmaWVkIENoaW5lc2UgKEdCIDIzMTIpJyxcblx0XHRsYWJlbFNob3J0OiAnR0IgMjMxMicsXG5cdFx0b3JkZXI6IDQ3LFxuXHRcdGd1ZXNzYWJsZU5hbWU6ICdHQjIzMTInXG5cdH0sXG5cdGNwODY1OiB7XG5cdFx0bGFiZWxMb25nOiAnTm9yZGljIERPUyAoQ1AgODY1KScsXG5cdFx0bGFiZWxTaG9ydDogJ0NQIDg2NScsXG5cdFx0b3JkZXI6IDQ4XG5cdH0sXG5cdGNwODUwOiB7XG5cdFx0bGFiZWxMb25nOiAnV2VzdGVybiBFdXJvcGVhbiBET1MgKENQIDg1MCknLFxuXHRcdGxhYmVsU2hvcnQ6ICdDUCA4NTAnLFxuXHRcdG9yZGVyOiA0OVxuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgR1VFU1NBQkxFX0VOQ09ESU5HUzogRW5jb2RpbmdzTWFwID0gKCgpID0+IHtcblx0Y29uc3QgZ3Vlc3NhYmxlRW5jb2RpbmdzOiBFbmNvZGluZ3NNYXAgPSB7fTtcblx0Zm9yIChjb25zdCBlbmNvZGluZyBpbiBTVVBQT1JURURfRU5DT0RJTkdTKSB7XG5cdFx0aWYgKFNVUFBPUlRFRF9FTkNPRElOR1NbZW5jb2RpbmddLmd1ZXNzYWJsZU5hbWUpIHtcblx0XHRcdGd1ZXNzYWJsZUVuY29kaW5nc1tlbmNvZGluZ10gPSBTVVBQT1JURURfRU5DT0RJTkdTW2VuY29kaW5nXTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZ3Vlc3NhYmxlRW5jb2RpbmdzO1xufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQW1DLG9CQUFvQixvQkFBb0I7QUFDM0UsU0FBUyxnQkFBMEQ7QUFDbkUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQkFBZ0I7QUFFbEIsTUFBTSxPQUFPO0FBQ2IsTUFBTSxnQkFBZ0I7QUFDdEIsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sVUFBVTtBQUloQixTQUFTLGNBQWMsVUFBNEM7QUFDekUsU0FBTyxDQUFDLE1BQU0sZUFBZSxTQUFTLE9BQU8sRUFBRSxLQUFLLGlCQUFlLGdCQUFnQixRQUFRO0FBQzVGO0FBRU8sTUFBTSxjQUFjLENBQUMsS0FBTSxHQUFJO0FBQy9CLE1BQU0sY0FBYyxDQUFDLEtBQU0sR0FBSTtBQUMvQixNQUFNLFdBQVcsQ0FBQyxLQUFNLEtBQU0sR0FBSTtBQUV6QyxNQUFNLHFDQUFxQztBQUMzQyxNQUFNLDhCQUE4QjtBQUNwQyxNQUFNLGdDQUFnQyxNQUFNO0FBQzVDLE1BQU0sZ0NBQWdDLE1BQU07QUFnQnJDLElBQVcsd0JBQVgsa0JBQVdBLDJCQUFYO0FBTU4sRUFBQUEsOENBQUEsc0JBQW1CLEtBQW5CO0FBTmlCLFNBQUFBO0FBQUEsR0FBQTtBQVNYLE1BQU0sMEJBQTBCLE1BQU07QUFBQSxFQUU1QyxZQUNDLFNBQ1MsdUJBQ1I7QUFDRCxVQUFNLE9BQU87QUFGSjtBQUFBLEVBR1Y7QUFDRDtBQU9BLE1BQU0sY0FBd0M7QUFBQSxFQXNDckMsWUFBb0Isa0JBQWtDO0FBQWxDO0FBQUEsRUFBb0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBMUJoRSxhQUFhLE9BQU8sVUFBMEM7QUFDN0QsUUFBSSxVQUFzQztBQUMxQyxRQUFJLGFBQWEsTUFBTTtBQUN0QixZQUFNLFFBQVEsTUFBTSxvQkFBNkQsMEJBQTBCLHVCQUF1QjtBQUNsSSxnQkFBVSxNQUFNLFdBQVcsZUFBZSxRQUFRLENBQUM7QUFBQSxJQUNwRCxPQUFPO0FBQ04sWUFBTSxrQkFBa0IsSUFBSSxZQUFZO0FBQ3hDLGdCQUFVO0FBQUEsUUFDVCxNQUFNLFFBQTRCO0FBQ2pDLGlCQUFPLGdCQUFnQixPQUFPLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQSxZQUlyQyxRQUFRO0FBQUEsVUFDVCxDQUFDO0FBQUEsUUFDRjtBQUFBLFFBRUEsTUFBMEI7QUFDekIsaUJBQU8sZ0JBQWdCLE9BQU87QUFBQSxRQUMvQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxJQUFJLGNBQWMsT0FBTztBQUFBLEVBQ2pDO0FBQUEsRUFJQSxNQUFNLFFBQTRCO0FBQ2pDLFdBQU8sS0FBSyxpQkFBaUIsTUFBTSxNQUFNO0FBQUEsRUFDMUM7QUFBQSxFQUVBLE1BQTBCO0FBQ3pCLFdBQU8sS0FBSyxpQkFBaUIsSUFBSTtBQUFBLEVBQ2xDO0FBQ0Q7QUFFTyxTQUFTLGVBQWUsUUFBZ0MsU0FBNkQ7QUFDM0gsUUFBTSwrQkFBK0IsUUFBUSxpQ0FBaUMsUUFBUSxnQkFBZ0IsZ0NBQWdDO0FBRXRJLFNBQU8sSUFBSSxRQUE2QixDQUFDLFNBQVMsV0FBVztBQUM1RCxVQUFNLFNBQVMsbUJBQTJCLGFBQVcsUUFBUSxLQUFLLEVBQUUsQ0FBQztBQUVyRSxVQUFNLGlCQUE2QixDQUFDO0FBQ3BDLFFBQUksZ0JBQWdCO0FBRXBCLFFBQUksVUFBc0M7QUFFMUMsVUFBTSxNQUFNLElBQUksd0JBQXdCO0FBRXhDLFVBQU0sZ0JBQWdCLFlBQVk7QUFDakMsVUFBSTtBQUdILGNBQU0sV0FBVyxNQUFNLHlCQUF5QjtBQUFBLFVBQy9DLFFBQVEsU0FBUyxPQUFPLGNBQWM7QUFBQSxVQUN0QyxXQUFXO0FBQUEsUUFDWixHQUFHLFFBQVEsZUFBZSxRQUFRLHVCQUF1QjtBQUl6RCxZQUFJLFNBQVMsZUFBZSxRQUFRLGdCQUFnQjtBQUNuRCxnQkFBTSxJQUFJLGtCQUFrQiwyREFBMkQsd0JBQXNDO0FBQUEsUUFDOUg7QUFHQSxpQkFBUyxXQUFXLE1BQU0sUUFBUSxrQkFBa0IsU0FBUyxRQUFRO0FBR3JFLGtCQUFVLE1BQU0sY0FBYyxPQUFPLFNBQVMsUUFBUTtBQUN0RCxjQUFNLFVBQVUsUUFBUSxNQUFNLFNBQVMsT0FBTyxjQUFjLEVBQUUsTUFBTTtBQUNwRSxlQUFPLE1BQU0sT0FBTztBQUVwQix1QkFBZSxTQUFTO0FBQ3hCLHdCQUFnQjtBQUdoQixnQkFBUTtBQUFBLFVBQ1AsUUFBUTtBQUFBLFVBQ1I7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLFNBQVMsT0FBTztBQUdmLFlBQUksT0FBTztBQUNYLGVBQU8sUUFBUTtBQUVmLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBRUEsaUJBQWEsUUFBUTtBQUFBLE1BQ3BCLFFBQVEsT0FBTSxVQUFTO0FBR3RCLFlBQUksU0FBUztBQUNaLGlCQUFPLE1BQU0sUUFBUSxNQUFNLE1BQU0sTUFBTSxDQUFDO0FBQUEsUUFDekMsT0FHSztBQUNKLHlCQUFlLEtBQUssS0FBSztBQUN6QiwyQkFBaUIsTUFBTTtBQUd2QixjQUFJLGlCQUFpQiw4QkFBOEI7QUFHbEQsbUJBQU8sTUFBTTtBQUViLGtCQUFNLGNBQWM7QUFJcEIsdUJBQVcsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUFBLFVBQ2pDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsV0FBUyxPQUFPLE1BQU0sS0FBSztBQUFBO0FBQUEsTUFDcEMsT0FBTyxZQUFZO0FBS2xCLFlBQUksQ0FBQyxTQUFTO0FBQ2IsZ0JBQU0sY0FBYztBQUFBLFFBQ3JCO0FBR0EsZUFBTyxJQUFJLFNBQVMsSUFBSSxDQUFDO0FBQUEsTUFDMUI7QUFBQSxJQUNELEdBQUcsSUFBSSxLQUFLO0FBQUEsRUFDYixDQUFDO0FBQ0Y7QUFFQSxlQUFzQixpQkFBaUIsVUFBNEIsVUFBa0IsU0FBMkQ7QUFDL0ksUUFBTSxRQUFRLE1BQU0sb0JBQTZELDBCQUEwQix1QkFBdUI7QUFDbEksUUFBTSxVQUFVLE1BQU0sV0FBVyxlQUFlLFFBQVEsR0FBRyxPQUFPO0FBRWxFLE1BQUksZUFBZTtBQUNuQixNQUFJLE9BQU87QUFFWCxTQUFPO0FBQUEsSUFDTixPQUFPO0FBQ04sVUFBSSxNQUFNO0FBQ1QsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLFFBQVEsU0FBUyxLQUFLO0FBQzVCLFVBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsZUFBTztBQUtQLFlBQUksQ0FBQyxnQkFBZ0IsU0FBUyxRQUFRO0FBQ3JDLGtCQUFRLFVBQVU7QUFBQSxZQUNqQixLQUFLO0FBQUEsWUFDTCxLQUFLO0FBQ0oscUJBQU8sU0FBUyxLQUFLLFdBQVcsS0FBSyxRQUFRLENBQUM7QUFBQSxZQUMvQyxLQUFLO0FBQ0oscUJBQU8sU0FBUyxLQUFLLFdBQVcsS0FBSyxXQUFXLENBQUM7QUFBQSxZQUNsRCxLQUFLO0FBQ0oscUJBQU8sU0FBUyxLQUFLLFdBQVcsS0FBSyxXQUFXLENBQUM7QUFBQSxVQUNuRDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLFlBQVksUUFBUSxJQUFJO0FBQzlCLFlBQUksYUFBYSxVQUFVLFNBQVMsR0FBRztBQUN0Qyx5QkFBZTtBQUVmLGlCQUFPLFNBQVMsS0FBSyxTQUFTO0FBQUEsUUFDL0I7QUFFQSxlQUFPO0FBQUEsTUFDUjtBQUVBLHFCQUFlO0FBRWYsYUFBTyxTQUFTLEtBQUssUUFBUSxNQUFNLEtBQUssQ0FBQztBQUFBLElBQzFDO0FBQUEsRUFDRDtBQUNEO0FBRUEsZUFBc0IsZUFBZSxVQUFvQztBQUN4RSxRQUFNLFFBQVEsTUFBTSxvQkFBNkQsMEJBQTBCLHVCQUF1QjtBQUVsSSxTQUFPLE1BQU0sZUFBZSxlQUFlLFFBQVEsQ0FBQztBQUNyRDtBQUVPLFNBQVMsZUFBZSxLQUE0QjtBQUMxRCxNQUFJLFFBQVEsaUJBQWlCLFFBQVEsTUFBTTtBQUMxQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU87QUFDUjtBQUVPLFNBQVMsOEJBQThCLFFBQXlCLFdBQWtGO0FBQ3hKLE1BQUksQ0FBQyxVQUFVLFlBQVksWUFBWSxRQUFRO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxLQUFLLE9BQU8sVUFBVSxDQUFDO0FBQzdCLFFBQU0sS0FBSyxPQUFPLFVBQVUsQ0FBQztBQUc3QixNQUFJLE9BQU8sWUFBWSxDQUFDLEtBQUssT0FBTyxZQUFZLENBQUMsR0FBRztBQUNuRCxXQUFPO0FBQUEsRUFDUjtBQUdBLE1BQUksT0FBTyxZQUFZLENBQUMsS0FBSyxPQUFPLFlBQVksQ0FBQyxHQUFHO0FBQ25ELFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxZQUFZLFNBQVMsUUFBUTtBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sS0FBSyxPQUFPLFVBQVUsQ0FBQztBQUc3QixNQUFJLE9BQU8sU0FBUyxDQUFDLEtBQUssT0FBTyxTQUFTLENBQUMsS0FBSyxPQUFPLFNBQVMsQ0FBQyxHQUFHO0FBQ25FLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTztBQUNSO0FBT0EsTUFBTSxtQkFBbUIsQ0FBQyxTQUFTLFVBQVUsUUFBUTtBQUtyRCxlQUFlLHNCQUFzQixRQUFrQix5QkFBNEQ7QUFDbEgsUUFBTSxZQUFZLE1BQU0sb0JBQWdELGFBQWEsdUJBQXVCO0FBRzVHLFFBQU0sZ0JBQWdCLE9BQU8sTUFBTSxHQUFHLDZCQUE2QjtBQUtuRSxRQUFNLGVBQWUsYUFBYSxjQUFjLE1BQU07QUFHdEQsTUFBSSx5QkFBeUI7QUFDNUIsOEJBQTBCLFNBQVMsd0JBQXdCLElBQUksT0FBSyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7QUFDM0YsUUFBSSx3QkFBd0IsV0FBVyxHQUFHO0FBQ3pDLGdDQUEwQjtBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUVBLE1BQUk7QUFDSixNQUFJO0FBQ0gsY0FBVSxVQUFVLE9BQU8sY0FBYywwQkFBMEIsRUFBRSxpQkFBaUIsd0JBQXdCLElBQUksTUFBUztBQUFBLEVBQzVILFNBQVMsT0FBTztBQUNmLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxDQUFDLFNBQVMsVUFBVTtBQUN2QixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sTUFBTSxRQUFRLFNBQVMsWUFBWTtBQUN6QyxNQUFJLEtBQUssaUJBQWlCLFFBQVEsR0FBRyxHQUFHO0FBQ3ZDLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxvQkFBb0IsUUFBUSxRQUFRO0FBQzVDO0FBRUEsTUFBTSwrQkFBMkQ7QUFBQSxFQUNoRSxVQUFVO0FBQUEsRUFDVixRQUFRO0FBQ1Q7QUFFQSxTQUFTLGtCQUFrQixjQUE4QjtBQUN4RCxTQUFPLGFBQWEsUUFBUSxpQkFBaUIsRUFBRSxFQUFFLFlBQVk7QUFDOUQ7QUFFQSxTQUFTLG9CQUFvQixjQUE4QjtBQUMxRCxRQUFNLHlCQUF5QixrQkFBa0IsWUFBWTtBQUM3RCxRQUFNLFNBQVMsNkJBQTZCLHNCQUFzQjtBQUVsRSxTQUFPLFVBQVU7QUFDbEI7QUFFQSxTQUFTLG9CQUFvQixjQUEwQztBQUN0RSxRQUFNLHlCQUF5QixrQkFBa0IsWUFBWTtBQUM3RCxRQUFNLFNBQVMsb0JBQW9CLHNCQUFzQjtBQUV6RCxTQUFPLFNBQVMsT0FBTyxnQkFBZ0I7QUFDeEM7QUFFQSxTQUFTLGFBQWEsUUFBNEI7QUFDakQsTUFBSSxTQUFTO0FBQ2IsV0FBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2QyxjQUFVLE9BQU8sYUFBYSxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3hDO0FBRUEsU0FBTztBQUNSO0FBT08sU0FBUyxnQkFBZ0IsS0FBcUI7QUFDcEQsVUFBUSxLQUFLO0FBQUEsSUFDWixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsU0FBUztBQUNSLFlBQU0sSUFBSSxJQUFJLE1BQU0sY0FBYztBQUNsQyxVQUFJLEdBQUc7QUFDTixlQUFPLGFBQWEsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDRDtBQWNPLFNBQVMseUJBQXlCLEVBQUUsUUFBUSxVQUFVLEdBQWdCLG1CQUE2Qix5QkFBZ0c7QUFHek0sTUFBSSxXQUFXLDhCQUE4QixRQUFRLFNBQVM7QUFJOUQsTUFBSSxjQUFjO0FBQ2xCLE1BQUksYUFBYSxXQUFXLGFBQWEsV0FBVyxRQUFRO0FBQzNELFFBQUksaUJBQWlCO0FBQ3JCLFFBQUksaUJBQWlCO0FBQ3JCLFFBQUksbUJBQW1CO0FBUXZCLGFBQVMsSUFBSSxHQUFHLElBQUksYUFBYSxJQUFJLG9DQUFvQyxLQUFLO0FBQzdFLFlBQU0sV0FBWSxJQUFJLE1BQU07QUFDNUIsWUFBTSxhQUFjLE9BQU8sVUFBVSxDQUFDLE1BQU07QUFFNUMsVUFBSSxZQUFZO0FBQ2YsMkJBQW1CO0FBQUEsTUFDcEI7QUFHQSxVQUFJLG1CQUFtQixZQUFZLENBQUMsY0FBYyxDQUFDLFlBQVksYUFBYTtBQUMzRSx5QkFBaUI7QUFBQSxNQUNsQjtBQUdBLFVBQUksbUJBQW1CLFlBQVksY0FBYyxDQUFDLFlBQVksQ0FBQyxhQUFhO0FBQzNFLHlCQUFpQjtBQUFBLE1BQ2xCO0FBR0EsVUFBSSxjQUFjLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCO0FBQ3JEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLGtCQUFrQjtBQUNyQixVQUFJLGdCQUFnQjtBQUNuQixtQkFBVztBQUFBLE1BQ1osV0FBVyxnQkFBZ0I7QUFDMUIsbUJBQVc7QUFBQSxNQUNaLE9BQU87QUFDTixzQkFBYztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUdBLE1BQUkscUJBQXFCLENBQUMsZUFBZSxDQUFDLFlBQVksUUFBUTtBQUM3RCxXQUFPLHNCQUFzQixPQUFPLE1BQU0sR0FBRyxTQUFTLEdBQUcsdUJBQXVCLEVBQUUsS0FBSyxxQkFBbUI7QUFDekcsYUFBTztBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsVUFBVTtBQUFBLE1BQ1g7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBRUEsU0FBTyxFQUFFLGFBQWEsU0FBUztBQUNoQztBQUlPLE1BQU0sc0JBQW9DO0FBQUEsRUFDaEQsTUFBTTtBQUFBLElBQ0wsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxlQUFlO0FBQUEsRUFDaEI7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLFVBQVU7QUFBQSxJQUNULFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxXQUFXO0FBQUEsSUFDVixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxhQUFhO0FBQUEsSUFDWixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxVQUFVO0FBQUEsSUFDVCxXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsV0FBVztBQUFBLElBQ1YsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsYUFBYTtBQUFBLElBQ1osV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxlQUFlO0FBQUEsRUFDaEI7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxlQUFlO0FBQUEsRUFDaEI7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxXQUFXO0FBQUEsSUFDVixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsYUFBYTtBQUFBLElBQ1osV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxVQUFVO0FBQUEsSUFDVCxXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxlQUFlO0FBQUEsRUFDaEI7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxXQUFXO0FBQUEsSUFDVixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsV0FBVztBQUFBLElBQ1YsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxVQUFVO0FBQUEsSUFDVCxXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ04sV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxLQUFLO0FBQUEsSUFDSixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsV0FBVztBQUFBLElBQ1YsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLFVBQVU7QUFBQSxJQUNULFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQLGVBQWU7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ04sV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1AsZUFBZTtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxlQUFlO0FBQUEsRUFDaEI7QUFBQSxFQUNBLFlBQVk7QUFBQSxJQUNYLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxXQUFXO0FBQUEsSUFDVixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDUCxXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxlQUFlO0FBQUEsRUFDaEI7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sTUFBTSx1QkFBcUMsTUFBTTtBQUN2RCxRQUFNLHFCQUFtQyxDQUFDO0FBQzFDLGFBQVcsWUFBWSxxQkFBcUI7QUFDM0MsUUFBSSxvQkFBb0IsUUFBUSxFQUFFLGVBQWU7QUFDaEQseUJBQW1CLFFBQVEsSUFBSSxvQkFBb0IsUUFBUTtBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUixHQUFHOyIsCiAgIm5hbWVzIjogWyJEZWNvZGVTdHJlYW1FcnJvcktpbmQiXQp9Cg==
