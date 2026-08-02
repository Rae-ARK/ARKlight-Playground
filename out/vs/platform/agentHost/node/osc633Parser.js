var Osc633EventType = /* @__PURE__ */ ((Osc633EventType2) => {
  Osc633EventType2[Osc633EventType2["PromptStart"] = 0] = "PromptStart";
  Osc633EventType2[Osc633EventType2["CommandStart"] = 1] = "CommandStart";
  Osc633EventType2[Osc633EventType2["CommandExecuted"] = 2] = "CommandExecuted";
  Osc633EventType2[Osc633EventType2["CommandFinished"] = 3] = "CommandFinished";
  Osc633EventType2[Osc633EventType2["CommandLine"] = 4] = "CommandLine";
  Osc633EventType2[Osc633EventType2["Property"] = 5] = "Property";
  return Osc633EventType2;
})(Osc633EventType || {});
function deserializeOscMessage(message) {
  if (message.indexOf("\\") === -1) {
    return message;
  }
  return message.replaceAll(
    /\\(\\|x([0-9a-f]{2}))/gi,
    (_match, op, hex) => hex ? String.fromCharCode(parseInt(hex, 16)) : op
  );
}
function parseOsc633Payload(payload) {
  const semiIdx = payload.indexOf(";");
  if ((semiIdx === -1 ? payload.length : semiIdx) !== 1) {
    return void 0;
  }
  const command = payload[0];
  const argsRaw = semiIdx === -1 ? "" : payload.substring(semiIdx + 1);
  switch (command) {
    case "A":
      return { type: 0 /* PromptStart */ };
    case "B":
      return { type: 1 /* CommandStart */ };
    case "C":
      return { type: 2 /* CommandExecuted */ };
    case "D": {
      const exitCode = argsRaw.length > 0 ? parseInt(argsRaw, 10) : void 0;
      return {
        type: 3 /* CommandFinished */,
        exitCode: exitCode !== void 0 && !isNaN(exitCode) ? exitCode : void 0
      };
    }
    case "E": {
      const nonceIdx = argsRaw.indexOf(";");
      const commandLine = deserializeOscMessage(nonceIdx === -1 ? argsRaw : argsRaw.substring(0, nonceIdx));
      const nonce = nonceIdx === -1 ? void 0 : argsRaw.substring(nonceIdx + 1);
      return { type: 4 /* CommandLine */, commandLine, nonce };
    }
    case "P": {
      const deserialized = deserializeOscMessage(argsRaw);
      const eqIdx = deserialized.indexOf("=");
      if (eqIdx === -1) {
        return void 0;
      }
      return {
        type: 5 /* Property */,
        key: deserialized.substring(0, eqIdx),
        value: deserialized.substring(eqIdx + 1)
      };
    }
    default:
      return void 0;
  }
}
const ESC = "\x1B";
const OSC_START = ESC + "]";
const BEL = "\x07";
const ST = ESC + "\\";
class Osc633Parser {
  constructor() {
    /** Buffer for an incomplete OSC sequence (from ESC] up to but not including the terminator). */
    this._pendingOsc = "";
    /** Whether we are currently accumulating an OSC sequence. */
    this._inOsc = false;
    /** Set when the previous chunk ended with ESC inside an OSC body (potential ST start). */
    this._pendingEscInOsc = false;
  }
  /**
   * Parse a chunk of PTY data.
   * Returns cleaned data (all OSC 633 sequences removed) and extracted events.
   *
   * This is a convenience view over {@link parseSegments} that concatenates the
   * cleaned-data segments and collects the events. Callers that need to know
   * whether a run of output arrived before or after an event (for correct
   * command-output attribution) should use {@link parseSegments} instead.
   */
  parse(data) {
    const events = [];
    let cleanedData = "";
    for (const segment of this.parseSegments(data)) {
      if (segment.kind === "data") {
        cleanedData += segment.data;
      } else {
        events.push(segment.event);
      }
    }
    return { cleanedData, events };
  }
  /**
   * Parse a chunk of PTY data into an ordered list of segments, preserving the
   * relative order of cleaned output data and OSC 633 events as they appear in
   * the stream. Handles partial sequences that span multiple chunks.
   *
   * Preserving order matters because a single PTY read frequently contains a
   * command's output immediately followed by its `CommandFinished` marker;
   * consumers must append that output to the command before handling the
   * finished event, otherwise the output is lost from the command result.
   */
  parseSegments(data) {
    const segments = [];
    let pending = "";
    const appendData = (value) => {
      pending += value;
    };
    const flushData = () => {
      if (pending.length > 0) {
        segments.push({ kind: "data", data: pending });
        pending = "";
      }
    };
    const emitEvent = (event) => {
      flushData();
      segments.push({ kind: "event", event });
    };
    if (!this._inOsc && data.indexOf(OSC_START) === -1) {
      appendData(data);
      flushData();
      return segments;
    }
    let i = 0;
    while (i < data.length) {
      if (this._inOsc) {
        if (this._pendingEscInOsc) {
          this._pendingEscInOsc = false;
          if (data[i] === "\\") {
            i++;
            this._inOsc = false;
            const payload2 = this._pendingOsc;
            this._pendingOsc = "";
            this._handleOscPayload(payload2, emitEvent, appendData, ST);
            continue;
          }
          this._inOsc = false;
          const payload = this._pendingOsc;
          this._pendingOsc = "";
          this._handleOscPayload(payload, emitEvent, appendData);
          continue;
        }
        const result2 = this._consumeOscBody(data, i);
        i = result2.nextIndex;
        if (result2.complete) {
          this._inOsc = false;
          const payload = this._pendingOsc;
          this._pendingOsc = "";
          this._handleOscPayload(payload, emitEvent, appendData, result2.terminator);
        } else if (result2.pendingEsc) {
          this._pendingEscInOsc = true;
        }
        continue;
      }
      const escIdx = data.indexOf(OSC_START, i);
      if (escIdx === -1) {
        appendData(data.substring(i));
        i = data.length;
        continue;
      }
      appendData(data.substring(i, escIdx));
      i = escIdx + 2;
      this._pendingOsc = "";
      this._inOsc = true;
      const result = this._consumeOscBody(data, i);
      i = result.nextIndex;
      if (result.complete) {
        this._inOsc = false;
        const payload = this._pendingOsc;
        this._pendingOsc = "";
        this._handleOscPayload(payload, emitEvent, appendData, result.terminator);
      } else if (result.pendingEsc) {
        this._pendingEscInOsc = true;
      }
    }
    flushData();
    return segments;
  }
  /**
   * Consume characters from the OSC body, appending to _pendingOsc until a
   * terminator (BEL or ST) is found.
   */
  _consumeOscBody(data, startIdx) {
    const belIdx = data.indexOf(BEL, startIdx);
    const escIdx = data.indexOf(ESC, startIdx);
    if (belIdx !== -1 && (escIdx === -1 || belIdx < escIdx)) {
      this._pendingOsc += data.substring(startIdx, belIdx);
      return { nextIndex: belIdx + 1, complete: true, terminator: BEL };
    }
    if (escIdx !== -1) {
      if (escIdx + 1 >= data.length) {
        this._pendingOsc += data.substring(startIdx, escIdx);
        return { nextIndex: data.length, complete: false, pendingEsc: true };
      }
      this._pendingOsc += data.substring(startIdx, escIdx);
      if (data[escIdx + 1] === "\\") {
        return { nextIndex: escIdx + 2, complete: true, terminator: ST };
      }
      return { nextIndex: escIdx, complete: true };
    }
    this._pendingOsc += data.substring(startIdx);
    return { nextIndex: data.length, complete: false };
  }
  /**
   * Process a complete OSC payload. If it's a 633; sequence, extract the
   * event via {@link emitEvent}. Otherwise, reconstruct the original bytes and
   * pass them through to the cleaned output via {@link appendData}.
   */
  _handleOscPayload(payload, emitEvent, appendData, terminator = BEL) {
    if (payload.startsWith("633;")) {
      const oscContent = payload.substring(4);
      const event = parseOsc633Payload(oscContent);
      if (event) {
        emitEvent(event);
      }
    } else {
      appendData(OSC_START + payload + terminator);
    }
  }
}
export {
  Osc633EventType,
  Osc633Parser
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL29zYzYzM1BhcnNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogTGlnaHR3ZWlnaHQgcGFyc2VyIGZvciBPU0MgNjMzIChWUyBDb2RlIHNoZWxsIGludGVncmF0aW9uKSBzZXF1ZW5jZXMgaW4gcmF3XG4gKiBQVFkgb3V0cHV0LiBEZXNpZ25lZCBmb3IgdGhlIGFnZW50IGhvc3Qgd2hlcmUgd2UgZG9uJ3QgaGF2ZSBhIGZ1bGwgeHRlcm0uanNcbiAqIGluc3RhbmNlIC0gaXQgc2NhbnMgZGF0YSBjaHVua3MgZm9yIHRoZSBzZXF1ZW5jZXMsIGV4dHJhY3RzIGV2ZW50cywgYW5kXG4gKiByZW1vdmVzIHRoZSBzZXF1ZW5jZXMgZnJvbSB0aGUgZGF0YSBzdHJlYW0uXG4gKlxuICogSGFuZGxlcyBwYXJ0aWFsIHNlcXVlbmNlcyB0aGF0IHNwYW4gYWNyb3NzIGRhdGEgY2h1bmsgYm91bmRhcmllcy5cbiAqL1xuXG4vKiogT1NDIDYzMyBldmVudCB0eXBlcyB3ZSBjYXJlIGFib3V0LiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gT3NjNjMzRXZlbnRUeXBlIHtcblx0LyoqIDYzMztBIC0gUHJvbXB0IHN0YXJ0LiBVc2VkIHRvIGRldGVjdCBzaGVsbCBpbnRlZ3JhdGlvbiBpcyBhY3RpdmUuICovXG5cdFByb21wdFN0YXJ0LFxuXHQvKiogNjMzO0IgLSBDb21tYW5kIHN0YXJ0ICh3aGVyZSB1c2VyIGlucHV0cyBjb21tYW5kKS4gKi9cblx0Q29tbWFuZFN0YXJ0LFxuXHQvKiogNjMzO0MgLSBDb21tYW5kIGV4ZWN1dGVkIChvdXRwdXQgYmVnaW5zKS4gKi9cblx0Q29tbWFuZEV4ZWN1dGVkLFxuXHQvKiogNjMzO0RbO2V4aXRDb2RlXSAtIENvbW1hbmQgZmluaXNoZWQuICovXG5cdENvbW1hbmRGaW5pc2hlZCxcblx0LyoqIDYzMztFO2NvbW1hbmRMaW5lWztub25jZV0gLSBFeHBsaWNpdCBjb21tYW5kIGxpbmUuICovXG5cdENvbW1hbmRMaW5lLFxuXHQvKiogNjMzO1A7S2V5PVZhbHVlIC0gUHJvcGVydHkgKGUuZy4gQ3dkKS4gKi9cblx0UHJvcGVydHksXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9zYzYzM1Byb21wdFN0YXJ0RXZlbnQge1xuXHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuUHJvbXB0U3RhcnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9zYzYzM0NvbW1hbmRTdGFydEV2ZW50IHtcblx0dHlwZTogT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRTdGFydDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3NjNjMzQ29tbWFuZEV4ZWN1dGVkRXZlbnQge1xuXHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZEV4ZWN1dGVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M2MzNDb21tYW5kRmluaXNoZWRFdmVudCB7XG5cdHR5cGU6IE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kRmluaXNoZWQ7XG5cdGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9zYzYzM0NvbW1hbmRMaW5lRXZlbnQge1xuXHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZExpbmU7XG5cdGNvbW1hbmRMaW5lOiBzdHJpbmc7XG5cdG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9zYzYzM1Byb3BlcnR5RXZlbnQge1xuXHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuUHJvcGVydHk7XG5cdGtleTogc3RyaW5nO1xuXHR2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBPc2M2MzNFdmVudCA9XG5cdHwgSU9zYzYzM1Byb21wdFN0YXJ0RXZlbnRcblx0fCBJT3NjNjMzQ29tbWFuZFN0YXJ0RXZlbnRcblx0fCBJT3NjNjMzQ29tbWFuZEV4ZWN1dGVkRXZlbnRcblx0fCBJT3NjNjMzQ29tbWFuZEZpbmlzaGVkRXZlbnRcblx0fCBJT3NjNjMzQ29tbWFuZExpbmVFdmVudFxuXHR8IElPc2M2MzNQcm9wZXJ0eUV2ZW50O1xuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M2MzNQYXJzZVJlc3VsdCB7XG5cdC8qKiBEYXRhIHdpdGggYWxsIE9TQyA2MzMgc2VxdWVuY2VzIHN0cmlwcGVkLiAqL1xuXHRjbGVhbmVkRGF0YTogc3RyaW5nO1xuXHQvKiogUGFyc2VkIGV2ZW50cyBpbiBvcmRlciBvZiBhcHBlYXJhbmNlLiAqL1xuXHRldmVudHM6IE9zYzYzM0V2ZW50W107XG59XG5cbi8qKlxuICogQSBzaW5nbGUgc2VnbWVudCBvZiBwYXJzZWQgUFRZIGRhdGE6IGVpdGhlciBhIHJ1biBvZiBjbGVhbmVkIG91dHB1dCBkYXRhIG9yXG4gKiBhbiBPU0MgNjMzIGV2ZW50LiBTZWdtZW50cyBhcmUgZW1pdHRlZCBpbiBzdHJlYW0gb3JkZXIgc28gdGhhdCBvdXRwdXQgd2hpY2hcbiAqIGFycml2ZXMgYmVmb3JlIGFuIGV2ZW50IChlLmcuIGEgYENvbW1hbmRGaW5pc2hlZGAgbWFya2VyKSBjYW4gYmUgYXR0cmlidXRlZFxuICogdG8gdGhlIGNvbW1hbmQgYmVmb3JlIHRoZSBldmVudCBpcyBoYW5kbGVkIFx1MjAxNCBzZWUge0BsaW5rIE9zYzYzM1BhcnNlci5wYXJzZVNlZ21lbnRzfS5cbiAqL1xuZXhwb3J0IHR5cGUgT3NjNjMzUGFyc2VTZWdtZW50ID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdkYXRhJzsgcmVhZG9ubHkgZGF0YTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdldmVudCc7IHJlYWRvbmx5IGV2ZW50OiBPc2M2MzNFdmVudCB9O1xuXG4vKipcbiAqIERlY29kZSBlc2NhcGVkIHZhbHVlcyBpbiBPU0MgNjMzIG1lc3NhZ2VzLlxuICogSGFuZGxlcyBgXFxcXGAgLT4gYFxcYCBhbmQgYFxceEFCYCAtPiBjaGFyYWN0ZXIgd2l0aCBjb2RlIDB4QUIuXG4gKi9cbmZ1bmN0aW9uIGRlc2VyaWFsaXplT3NjTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAobWVzc2FnZS5pbmRleE9mKCdcXFxcJykgPT09IC0xKSB7XG5cdFx0cmV0dXJuIG1lc3NhZ2U7XG5cdH1cblx0cmV0dXJuIG1lc3NhZ2UucmVwbGFjZUFsbChcblx0XHQvXFxcXChcXFxcfHgoWzAtOWEtZl17Mn0pKS9naSxcblx0XHQoX21hdGNoOiBzdHJpbmcsIG9wOiBzdHJpbmcsIGhleD86IHN0cmluZykgPT4gaGV4ID8gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChoZXgsIDE2KSkgOiBvcCxcblx0KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VPc2M2MzNQYXlsb2FkKHBheWxvYWQ6IHN0cmluZyk6IE9zYzYzM0V2ZW50IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2VtaUlkeCA9IHBheWxvYWQuaW5kZXhPZignOycpO1xuXHRpZiAoKHNlbWlJZHggPT09IC0xID8gcGF5bG9hZC5sZW5ndGggOiBzZW1pSWR4KSAhPT0gMSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBjb21tYW5kID0gcGF5bG9hZFswXTtcblx0Y29uc3QgYXJnc1JhdyA9IHNlbWlJZHggPT09IC0xID8gJycgOiBwYXlsb2FkLnN1YnN0cmluZyhzZW1pSWR4ICsgMSk7XG5cblx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0Y2FzZSAnQSc6XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBPc2M2MzNFdmVudFR5cGUuUHJvbXB0U3RhcnQgfTtcblx0XHRjYXNlICdCJzpcblx0XHRcdHJldHVybiB7IHR5cGU6IE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kU3RhcnQgfTtcblx0XHRjYXNlICdDJzpcblx0XHRcdHJldHVybiB7IHR5cGU6IE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kRXhlY3V0ZWQgfTtcblx0XHRjYXNlICdEJzoge1xuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSBhcmdzUmF3Lmxlbmd0aCA+IDAgPyBwYXJzZUludChhcmdzUmF3LCAxMCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZEZpbmlzaGVkLFxuXHRcdFx0XHRleGl0Q29kZTogZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiAhaXNOYU4oZXhpdENvZGUpID8gZXhpdENvZGUgOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdFJzoge1xuXHRcdFx0Y29uc3Qgbm9uY2VJZHggPSBhcmdzUmF3LmluZGV4T2YoJzsnKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gZGVzZXJpYWxpemVPc2NNZXNzYWdlKG5vbmNlSWR4ID09PSAtMSA/IGFyZ3NSYXcgOiBhcmdzUmF3LnN1YnN0cmluZygwLCBub25jZUlkeCkpO1xuXHRcdFx0Y29uc3Qgbm9uY2UgPSBub25jZUlkeCA9PT0gLTEgPyB1bmRlZmluZWQgOiBhcmdzUmF3LnN1YnN0cmluZyhub25jZUlkeCArIDEpO1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRMaW5lLCBjb21tYW5kTGluZSwgbm9uY2UgfTtcblx0XHR9XG5cdFx0Y2FzZSAnUCc6IHtcblx0XHRcdGNvbnN0IGRlc2VyaWFsaXplZCA9IGRlc2VyaWFsaXplT3NjTWVzc2FnZShhcmdzUmF3KTtcblx0XHRcdGNvbnN0IGVxSWR4ID0gZGVzZXJpYWxpemVkLmluZGV4T2YoJz0nKTtcblx0XHRcdGlmIChlcUlkeCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IE9zYzYzM0V2ZW50VHlwZS5Qcm9wZXJ0eSxcblx0XHRcdFx0a2V5OiBkZXNlcmlhbGl6ZWQuc3Vic3RyaW5nKDAsIGVxSWR4KSxcblx0XHRcdFx0dmFsdWU6IGRlc2VyaWFsaXplZC5zdWJzdHJpbmcoZXFJZHggKyAxKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8vIE9TQyBpbnRyb2R1Y2VyIGlzIEVTQyBdICgweDFiIDB4NWQpXG5jb25zdCBFU0MgPSAnXFx4MWInO1xuY29uc3QgT1NDX1NUQVJUID0gRVNDICsgJ10nO1xuLy8gVGVybWluYXRvcnM6IEJFTCAoMHgwNykgb3IgU1QgKEVTQyBcXClcbmNvbnN0IEJFTCA9ICdcXHgwNyc7XG5jb25zdCBTVCA9IEVTQyArICdcXFxcJztcblxuLyoqXG4gKiBTdGF0ZWZ1bCBwYXJzZXIgdGhhdCBoYW5kbGVzIGRhdGEgY2h1bmtzLCBjb3JyZWN0bHkgZGVhbGluZyB3aXRoXG4gKiBwYXJ0aWFsIHNlcXVlbmNlcyB0aGF0IHNwYW4gbXVsdGlwbGUgY2h1bmtzLlxuICovXG5leHBvcnQgY2xhc3MgT3NjNjMzUGFyc2VyIHtcblx0LyoqIEJ1ZmZlciBmb3IgYW4gaW5jb21wbGV0ZSBPU0Mgc2VxdWVuY2UgKGZyb20gRVNDXSB1cCB0byBidXQgbm90IGluY2x1ZGluZyB0aGUgdGVybWluYXRvcikuICovXG5cdHByaXZhdGUgX3BlbmRpbmdPc2MgPSAnJztcblx0LyoqIFdoZXRoZXIgd2UgYXJlIGN1cnJlbnRseSBhY2N1bXVsYXRpbmcgYW4gT1NDIHNlcXVlbmNlLiAqL1xuXHRwcml2YXRlIF9pbk9zYyA9IGZhbHNlO1xuXHQvKiogU2V0IHdoZW4gdGhlIHByZXZpb3VzIGNodW5rIGVuZGVkIHdpdGggRVNDIGluc2lkZSBhbiBPU0MgYm9keSAocG90ZW50aWFsIFNUIHN0YXJ0KS4gKi9cblx0cHJpdmF0ZSBfcGVuZGluZ0VzY0luT3NjID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFBhcnNlIGEgY2h1bmsgb2YgUFRZIGRhdGEuXG5cdCAqIFJldHVybnMgY2xlYW5lZCBkYXRhIChhbGwgT1NDIDYzMyBzZXF1ZW5jZXMgcmVtb3ZlZCkgYW5kIGV4dHJhY3RlZCBldmVudHMuXG5cdCAqXG5cdCAqIFRoaXMgaXMgYSBjb252ZW5pZW5jZSB2aWV3IG92ZXIge0BsaW5rIHBhcnNlU2VnbWVudHN9IHRoYXQgY29uY2F0ZW5hdGVzIHRoZVxuXHQgKiBjbGVhbmVkLWRhdGEgc2VnbWVudHMgYW5kIGNvbGxlY3RzIHRoZSBldmVudHMuIENhbGxlcnMgdGhhdCBuZWVkIHRvIGtub3dcblx0ICogd2hldGhlciBhIHJ1biBvZiBvdXRwdXQgYXJyaXZlZCBiZWZvcmUgb3IgYWZ0ZXIgYW4gZXZlbnQgKGZvciBjb3JyZWN0XG5cdCAqIGNvbW1hbmQtb3V0cHV0IGF0dHJpYnV0aW9uKSBzaG91bGQgdXNlIHtAbGluayBwYXJzZVNlZ21lbnRzfSBpbnN0ZWFkLlxuXHQgKi9cblx0cGFyc2UoZGF0YTogc3RyaW5nKTogSU9zYzYzM1BhcnNlUmVzdWx0IHtcblx0XHRjb25zdCBldmVudHM6IE9zYzYzM0V2ZW50W10gPSBbXTtcblx0XHRsZXQgY2xlYW5lZERhdGEgPSAnJztcblx0XHRmb3IgKGNvbnN0IHNlZ21lbnQgb2YgdGhpcy5wYXJzZVNlZ21lbnRzKGRhdGEpKSB7XG5cdFx0XHRpZiAoc2VnbWVudC5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdFx0Y2xlYW5lZERhdGEgKz0gc2VnbWVudC5kYXRhO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goc2VnbWVudC5ldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGNsZWFuZWREYXRhLCBldmVudHMgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQYXJzZSBhIGNodW5rIG9mIFBUWSBkYXRhIGludG8gYW4gb3JkZXJlZCBsaXN0IG9mIHNlZ21lbnRzLCBwcmVzZXJ2aW5nIHRoZVxuXHQgKiByZWxhdGl2ZSBvcmRlciBvZiBjbGVhbmVkIG91dHB1dCBkYXRhIGFuZCBPU0MgNjMzIGV2ZW50cyBhcyB0aGV5IGFwcGVhciBpblxuXHQgKiB0aGUgc3RyZWFtLiBIYW5kbGVzIHBhcnRpYWwgc2VxdWVuY2VzIHRoYXQgc3BhbiBtdWx0aXBsZSBjaHVua3MuXG5cdCAqXG5cdCAqIFByZXNlcnZpbmcgb3JkZXIgbWF0dGVycyBiZWNhdXNlIGEgc2luZ2xlIFBUWSByZWFkIGZyZXF1ZW50bHkgY29udGFpbnMgYVxuXHQgKiBjb21tYW5kJ3Mgb3V0cHV0IGltbWVkaWF0ZWx5IGZvbGxvd2VkIGJ5IGl0cyBgQ29tbWFuZEZpbmlzaGVkYCBtYXJrZXI7XG5cdCAqIGNvbnN1bWVycyBtdXN0IGFwcGVuZCB0aGF0IG91dHB1dCB0byB0aGUgY29tbWFuZCBiZWZvcmUgaGFuZGxpbmcgdGhlXG5cdCAqIGZpbmlzaGVkIGV2ZW50LCBvdGhlcndpc2UgdGhlIG91dHB1dCBpcyBsb3N0IGZyb20gdGhlIGNvbW1hbmQgcmVzdWx0LlxuXHQgKi9cblx0cGFyc2VTZWdtZW50cyhkYXRhOiBzdHJpbmcpOiBPc2M2MzNQYXJzZVNlZ21lbnRbXSB7XG5cdFx0Y29uc3Qgc2VnbWVudHM6IE9zYzYzM1BhcnNlU2VnbWVudFtdID0gW107XG5cdFx0bGV0IHBlbmRpbmcgPSAnJztcblxuXHRcdGNvbnN0IGFwcGVuZERhdGEgPSAodmFsdWU6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0cGVuZGluZyArPSB2YWx1ZTtcblx0XHR9O1xuXHRcdGNvbnN0IGZsdXNoRGF0YSA9ICgpOiB2b2lkID0+IHtcblx0XHRcdGlmIChwZW5kaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0c2VnbWVudHMucHVzaCh7IGtpbmQ6ICdkYXRhJywgZGF0YTogcGVuZGluZyB9KTtcblx0XHRcdFx0cGVuZGluZyA9ICcnO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgZW1pdEV2ZW50ID0gKGV2ZW50OiBPc2M2MzNFdmVudCk6IHZvaWQgPT4ge1xuXHRcdFx0Zmx1c2hEYXRhKCk7XG5cdFx0XHRzZWdtZW50cy5wdXNoKHsga2luZDogJ2V2ZW50JywgZXZlbnQgfSk7XG5cdFx0fTtcblxuXHRcdGlmICghdGhpcy5faW5Pc2MgJiYgZGF0YS5pbmRleE9mKE9TQ19TVEFSVCkgPT09IC0xKSB7XG5cdFx0XHRhcHBlbmREYXRhKGRhdGEpO1xuXHRcdFx0Zmx1c2hEYXRhKCk7XG5cdFx0XHRyZXR1cm4gc2VnbWVudHM7XG5cdFx0fVxuXG5cdFx0bGV0IGkgPSAwO1xuXG5cdFx0d2hpbGUgKGkgPCBkYXRhLmxlbmd0aCkge1xuXHRcdFx0aWYgKHRoaXMuX2luT3NjKSB7XG5cdFx0XHRcdC8vIEhhbmRsZSBFU0MgdGhhdCB3YXMgcGVuZGluZyBmcm9tIHRoZSBwcmV2aW91cyBjaHVuay5cblx0XHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdFc2NJbk9zYykge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdFc2NJbk9zYyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChkYXRhW2ldID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRcdC8vIEVTQyBcXCA9IFNUIHRlcm1pbmF0b3IsIHNlcXVlbmNlIGlzIGNvbXBsZXRlLlxuXHRcdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdFx0dGhpcy5faW5Pc2MgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNvbnN0IHBheWxvYWQgPSB0aGlzLl9wZW5kaW5nT3NjO1xuXHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ09zYyA9ICcnO1xuXHRcdFx0XHRcdFx0dGhpcy5faGFuZGxlT3NjUGF5bG9hZChwYXlsb2FkLCBlbWl0RXZlbnQsIGFwcGVuZERhdGEsIFNUKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBFU0Mgd2FzIG5vdCBmb2xsb3dlZCBieSBcXCwgbWFsZm9ybWVkOiBjb21wbGV0ZSB0aGUgT1NDIGFueXdheS5cblx0XHRcdFx0XHR0aGlzLl9pbk9zYyA9IGZhbHNlO1xuXHRcdFx0XHRcdGNvbnN0IHBheWxvYWQgPSB0aGlzLl9wZW5kaW5nT3NjO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdPc2MgPSAnJztcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVPc2NQYXlsb2FkKHBheWxvYWQsIGVtaXRFdmVudCwgYXBwZW5kRGF0YSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXZSdyZSBpbnNpZGUgYW4gT1NDIHNlcXVlbmNlLCBsb29rIGZvciB0aGUgdGVybWluYXRvci5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fY29uc3VtZU9zY0JvZHkoZGF0YSwgaSk7XG5cdFx0XHRcdGkgPSByZXN1bHQubmV4dEluZGV4O1xuXHRcdFx0XHRpZiAocmVzdWx0LmNvbXBsZXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5faW5Pc2MgPSBmYWxzZTtcblx0XHRcdFx0XHRjb25zdCBwYXlsb2FkID0gdGhpcy5fcGVuZGluZ09zYztcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nT3NjID0gJyc7XG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlT3NjUGF5bG9hZChwYXlsb2FkLCBlbWl0RXZlbnQsIGFwcGVuZERhdGEsIHJlc3VsdC50ZXJtaW5hdG9yKTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQucGVuZGluZ0VzYykge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdFc2NJbk9zYyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSWYgbm90IGNvbXBsZXRlLCBfcGVuZGluZ09zYyBoYXMgYmVlbiBleHRlbmRlZCwgYW5kIHdlJ3JlIGF0IGVuZCBvZiBkYXRhLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgdGhlIG5leHQgRVNDIF0gd2hpY2ggc3RhcnRzIGFuIE9TQyBzZXF1ZW5jZVxuXHRcdFx0Y29uc3QgZXNjSWR4ID0gZGF0YS5pbmRleE9mKE9TQ19TVEFSVCwgaSk7XG5cdFx0XHRpZiAoZXNjSWR4ID09PSAtMSkge1xuXHRcdFx0XHRhcHBlbmREYXRhKGRhdGEuc3Vic3RyaW5nKGkpKTtcblx0XHRcdFx0aSA9IGRhdGEubGVuZ3RoO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29weSBldmVyeXRoaW5nIGJlZm9yZSB0aGUgT1NDIHN0YXJ0IHRvIGNsZWFuZWQgb3V0cHV0LlxuXHRcdFx0YXBwZW5kRGF0YShkYXRhLnN1YnN0cmluZyhpLCBlc2NJZHgpKTtcblxuXHRcdFx0Ly8gU3RhcnQgb2YgT1NDOiBjaGVjayBpZiBpdCdzIDYzMy5cblx0XHRcdGkgPSBlc2NJZHggKyAyOyAvLyBza2lwIHBhc3QgRVNDIF1cblx0XHRcdHRoaXMuX3BlbmRpbmdPc2MgPSAnJztcblx0XHRcdHRoaXMuX2luT3NjID0gdHJ1ZTtcblxuXHRcdFx0Ly8gVHJ5IHRvIGNvbnN1bWUgdGhlIE9TQyBib2R5IGluIHRoaXMgc2FtZSBjaHVuay5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NvbnN1bWVPc2NCb2R5KGRhdGEsIGkpO1xuXHRcdFx0aSA9IHJlc3VsdC5uZXh0SW5kZXg7XG5cdFx0XHRpZiAocmVzdWx0LmNvbXBsZXRlKSB7XG5cdFx0XHRcdHRoaXMuX2luT3NjID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHBheWxvYWQgPSB0aGlzLl9wZW5kaW5nT3NjO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nT3NjID0gJyc7XG5cdFx0XHRcdC8vIElmIGl0J3MgYSA2MzMgc2VxdWVuY2UsIGV4dHJhY3QgZXZlbnQ7IG90aGVyd2lzZSBwdXQgaXQgYmFjayBpbiBjbGVhbmVkLlxuXHRcdFx0XHR0aGlzLl9oYW5kbGVPc2NQYXlsb2FkKHBheWxvYWQsIGVtaXRFdmVudCwgYXBwZW5kRGF0YSwgcmVzdWx0LnRlcm1pbmF0b3IpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXN1bHQucGVuZGluZ0VzYykge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRXNjSW5Pc2MgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgbm90IGNvbXBsZXRlLCB3ZSdyZSBhdCBlbmQgb2YgZGF0YSBhbmQgX3BlbmRpbmdPc2MgaXMgYnVmZmVyZWQuXG5cdFx0fVxuXG5cdFx0Zmx1c2hEYXRhKCk7XG5cdFx0cmV0dXJuIHNlZ21lbnRzO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN1bWUgY2hhcmFjdGVycyBmcm9tIHRoZSBPU0MgYm9keSwgYXBwZW5kaW5nIHRvIF9wZW5kaW5nT3NjIHVudGlsIGFcblx0ICogdGVybWluYXRvciAoQkVMIG9yIFNUKSBpcyBmb3VuZC5cblx0ICovXG5cdHByaXZhdGUgX2NvbnN1bWVPc2NCb2R5KGRhdGE6IHN0cmluZywgc3RhcnRJZHg6IG51bWJlcik6IHsgbmV4dEluZGV4OiBudW1iZXI7IGNvbXBsZXRlOiBib29sZWFuOyBwZW5kaW5nRXNjPzogYm9vbGVhbjsgdGVybWluYXRvcj86IHN0cmluZyB9IHtcblx0XHRjb25zdCBiZWxJZHggPSBkYXRhLmluZGV4T2YoQkVMLCBzdGFydElkeCk7XG5cdFx0Y29uc3QgZXNjSWR4ID0gZGF0YS5pbmRleE9mKEVTQywgc3RhcnRJZHgpO1xuXG5cdFx0aWYgKGJlbElkeCAhPT0gLTEgJiYgKGVzY0lkeCA9PT0gLTEgfHwgYmVsSWR4IDwgZXNjSWR4KSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ09zYyArPSBkYXRhLnN1YnN0cmluZyhzdGFydElkeCwgYmVsSWR4KTtcblx0XHRcdHJldHVybiB7IG5leHRJbmRleDogYmVsSWR4ICsgMSwgY29tcGxldGU6IHRydWUsIHRlcm1pbmF0b3I6IEJFTCB9O1xuXHRcdH1cblxuXHRcdGlmIChlc2NJZHggIT09IC0xKSB7XG5cdFx0XHRpZiAoZXNjSWR4ICsgMSA+PSBkYXRhLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nT3NjICs9IGRhdGEuc3Vic3RyaW5nKHN0YXJ0SWR4LCBlc2NJZHgpO1xuXHRcdFx0XHRyZXR1cm4geyBuZXh0SW5kZXg6IGRhdGEubGVuZ3RoLCBjb21wbGV0ZTogZmFsc2UsIHBlbmRpbmdFc2M6IHRydWUgfTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcGVuZGluZ09zYyArPSBkYXRhLnN1YnN0cmluZyhzdGFydElkeCwgZXNjSWR4KTtcblx0XHRcdGlmIChkYXRhW2VzY0lkeCArIDFdID09PSAnXFxcXCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgbmV4dEluZGV4OiBlc2NJZHggKyAyLCBjb21wbGV0ZTogdHJ1ZSwgdGVybWluYXRvcjogU1QgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgbmV4dEluZGV4OiBlc2NJZHgsIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ09zYyArPSBkYXRhLnN1YnN0cmluZyhzdGFydElkeCk7XG5cdFx0cmV0dXJuIHsgbmV4dEluZGV4OiBkYXRhLmxlbmd0aCwgY29tcGxldGU6IGZhbHNlIH07XG5cdH1cblxuXHQvKipcblx0ICogUHJvY2VzcyBhIGNvbXBsZXRlIE9TQyBwYXlsb2FkLiBJZiBpdCdzIGEgNjMzOyBzZXF1ZW5jZSwgZXh0cmFjdCB0aGVcblx0ICogZXZlbnQgdmlhIHtAbGluayBlbWl0RXZlbnR9LiBPdGhlcndpc2UsIHJlY29uc3RydWN0IHRoZSBvcmlnaW5hbCBieXRlcyBhbmRcblx0ICogcGFzcyB0aGVtIHRocm91Z2ggdG8gdGhlIGNsZWFuZWQgb3V0cHV0IHZpYSB7QGxpbmsgYXBwZW5kRGF0YX0uXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVPc2NQYXlsb2FkKFxuXHRcdHBheWxvYWQ6IHN0cmluZyxcblx0XHRlbWl0RXZlbnQ6IChldmVudDogT3NjNjMzRXZlbnQpID0+IHZvaWQsXG5cdFx0YXBwZW5kRGF0YTogKGRhdGE6IHN0cmluZykgPT4gdm9pZCxcblx0XHR0ZXJtaW5hdG9yID0gQkVMLFxuXHQpOiB2b2lkIHtcblx0XHRpZiAocGF5bG9hZC5zdGFydHNXaXRoKCc2MzM7JykpIHtcblx0XHRcdGNvbnN0IG9zY0NvbnRlbnQgPSBwYXlsb2FkLnN1YnN0cmluZyg0KTsgLy8gc3RyaXAgXCI2MzM7XCJcblx0XHRcdGNvbnN0IGV2ZW50ID0gcGFyc2VPc2M2MzNQYXlsb2FkKG9zY0NvbnRlbnQpO1xuXHRcdFx0aWYgKGV2ZW50KSB7XG5cdFx0XHRcdGVtaXRFdmVudChldmVudCk7XG5cdFx0XHR9XG5cdFx0XHQvLyA2MzMgc2VxdWVuY2VzIGFyZSBhbHdheXMgc3RyaXBwZWQgZnJvbSBvdXRwdXRcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm9uLTYzMyBPU0M6IHB1dCBiYWNrIHRoZSBvcmlnaW5hbCBieXRlcy5cblx0XHRcdGFwcGVuZERhdGEoT1NDX1NUQVJUICsgcGF5bG9hZCArIHRlcm1pbmF0b3IpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBZU8sSUFBVyxrQkFBWCxrQkFBV0EscUJBQVg7QUFFTixFQUFBQSxrQ0FBQTtBQUVBLEVBQUFBLGtDQUFBO0FBRUEsRUFBQUEsa0NBQUE7QUFFQSxFQUFBQSxrQ0FBQTtBQUVBLEVBQUFBLGtDQUFBO0FBRUEsRUFBQUEsa0NBQUE7QUFaaUIsU0FBQUE7QUFBQSxHQUFBO0FBeUVsQixTQUFTLHNCQUFzQixTQUF5QjtBQUN2RCxNQUFJLFFBQVEsUUFBUSxJQUFJLE1BQU0sSUFBSTtBQUNqQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sUUFBUTtBQUFBLElBQ2Q7QUFBQSxJQUNBLENBQUMsUUFBZ0IsSUFBWSxRQUFpQixNQUFN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QUFNLENBQUM7QUFHcEMsVUFBSSxTQUFTO0FBQ2IsV0FBSyxjQUFjO0FBQ25CLFdBQUssU0FBUztBQUdkLFlBQU0sU0FBUyxLQUFLLGdCQUFnQixNQUFNLENBQUM7QUFDM0MsVUFBSSxPQUFPO0FBQ1gsVUFBSSxPQUFPLFVBQVU7QUFDcEIsYUFBSyxTQUFTO0FBQ2QsY0FBTSxVQUFVLEtBQUs7QUFDckIsYUFBSyxjQUFjO0FBRW5CLGFBQUssa0JBQWtCLFNBQVMsV0FBVyxZQUFZLE9BQU8sVUFBVTtBQUFBLE1BQ3pFLFdBQVcsT0FBTyxZQUFZO0FBQzdCLGFBQUssbUJBQW1CO0FBQUEsTUFDekI7QUFBQSxJQUVEO0FBRUEsY0FBVTtBQUNWLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLGdCQUFnQixNQUFjLFVBQXVHO0FBQzVJLFVBQU0sU0FBUyxLQUFLLFFBQVEsS0FBSyxRQUFRO0FBQ3pDLFVBQU0sU0FBUyxLQUFLLFFBQVEsS0FBSyxRQUFRO0FBRXpDLFFBQUksV0FBVyxPQUFPLFdBQVcsTUFBTSxTQUFTLFNBQVM7QUFDeEQsV0FBSyxlQUFlLEtBQUssVUFBVSxVQUFVLE1BQU07QUFDbkQsYUFBTyxFQUFFLFdBQVcsU0FBUyxHQUFHLFVBQVUsTUFBTSxZQUFZLElBQUk7QUFBQSxJQUNqRTtBQUVBLFFBQUksV0FBVyxJQUFJO0FBQ2xCLFVBQUksU0FBUyxLQUFLLEtBQUssUUFBUTtBQUM5QixhQUFLLGVBQWUsS0FBSyxVQUFVLFVBQVUsTUFBTTtBQUNuRCxlQUFPLEVBQUUsV0FBVyxLQUFLLFFBQVEsVUFBVSxPQUFPLFlBQVksS0FBSztBQUFBLE1BQ3BFO0FBRUEsV0FBSyxlQUFlLEtBQUssVUFBVSxVQUFVLE1BQU07QUFDbkQsVUFBSSxLQUFLLFNBQVMsQ0FBQyxNQUFNLE1BQU07QUFDOUIsZUFBTyxFQUFFLFdBQVcsU0FBUyxHQUFHLFVBQVUsTUFBTSxZQUFZLEdBQUc7QUFBQSxNQUNoRTtBQUVBLGFBQU8sRUFBRSxXQUFXLFFBQVEsVUFBVSxLQUFLO0FBQUEsSUFDNUM7QUFFQSxTQUFLLGVBQWUsS0FBSyxVQUFVLFFBQVE7QUFDM0MsV0FBTyxFQUFFLFdBQVcsS0FBSyxRQUFRLFVBQVUsTUFBTTtBQUFBLEVBQ2xEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1Esa0JBQ1AsU0FDQSxXQUNBLFlBQ0EsYUFBYSxLQUNOO0FBQ1AsUUFBSSxRQUFRLFdBQVcsTUFBTSxHQUFHO0FBQy9CLFlBQU0sYUFBYSxRQUFRLFVBQVUsQ0FBQztBQUN0QyxZQUFNLFFBQVEsbUJBQW1CLFVBQVU7QUFDM0MsVUFBSSxPQUFPO0FBQ1Ysa0JBQVUsS0FBSztBQUFBLE1BQ2hCO0FBQUEsSUFFRCxPQUFPO0FBRU4saUJBQVcsWUFBWSxVQUFVLFVBQVU7QUFBQSxJQUM1QztBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiT3NjNjMzRXZlbnRUeXBlIiwgInBheWxvYWQiLCAicmVzdWx0Il0KfQo=
