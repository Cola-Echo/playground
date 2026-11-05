/**
 * File: src/core/PlaygroundBridge.js
 * Description: Independent Playground panel. Drives /prompts/new_chat UI so the page itself performs
 * WAA-signed GenerateContent, then converts the JSPB response back to Gemini JSON. Avoids Build
 * ProxyUnaryCall and does not rely on reading window.default_MakerSuite from Playwright.
 *
 * Local fork for AIStudioPlayground (2026-10-23).
 */

const RPC_PATH = "/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/";
const MODEL_PATH_RE = /^\/v1(?:beta|alpha)?\/models\/([^:/]+):(generateContent|streamGenerateContent|countTokens)$/;

const HARM_CATEGORY = {
    HARM_CATEGORY_CIVIC_INTEGRITY: 11,
    HARM_CATEGORY_DANGEROUS_CONTENT: 10,
    HARM_CATEGORY_HARASSMENT: 7,
    HARM_CATEGORY_HATE_SPEECH: 8,
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 9,
};
const HARM_THRESHOLD = {
    BLOCK_LOW_AND_ABOVE: 1,
    BLOCK_MEDIUM_AND_ABOVE: 2,
    BLOCK_NONE: 4,
    BLOCK_ONLY_HIGH: 3,
    HARM_BLOCK_THRESHOLD_UNSPECIFIED: 0,
    OFF: 5,
};
const FINISH_REASON = [
    "FINISH_REASON_UNSPECIFIED",
    "STOP",
    "MAX_TOKENS",
    "SAFETY",
    "RECITATION",
    "OTHER",
    "LANGUAGE",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
    "MALFORMED_FUNCTION_CALL",
    "IMAGE_SAFETY",
    "UNEXPECTED_TOOL_CALL",
    "TOO_MANY_TOOL_CALLS",
    "IMAGE_PROHIBITED_CONTENT",
    "IMAGE_OTHER",
    "NO_IMAGE",
    "IMAGE_RECITATION",
];
const BLOCK_REASON = ["BLOCK_REASON_UNSPECIFIED", "SAFETY", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"];
const HARM_CATEGORY_NAMES = Object.fromEntries(Object.entries(HARM_CATEGORY).map(([k, v]) => [v, k]));
const HARM_PROBABILITY = ["HARM_PROBABILITY_UNSPECIFIED", "NEGLIGIBLE", "LOW", "MEDIUM", "HIGH"];
const MODALITY = ["MODALITY_UNSPECIFIED", "TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"];
const RESPONSE_MODALITY = { AUDIO: 3, IMAGE: 2, TEXT: 1 };
const SCHEMA_TYPE = { ARRAY: 5, BOOLEAN: 4, INTEGER: 3, NULL: 7, NUMBER: 2, OBJECT: 6, STRING: 1 };
const FUNCTION_CALLING_MODE = { ANY: 2, AUTO: 1, MODE_UNSPECIFIED: 0, NONE: 3, VALIDATED: 4 };
const THINKING_LEVEL = { HIGH: 3, LOW: 1, MEDIUM: 2, MINIMAL: 4 };
const CODE_LANGUAGE = ["LANGUAGE_UNSPECIFIED", "PYTHON"];
const CODE_OUTCOME = ["OUTCOME_UNSPECIFIED", "OUTCOME_OK", "OUTCOME_FAILED", "OUTCOME_DEADLINE_EXCEEDED"];

const setField = (arr, fieldNumber, value) => {
    if (value === undefined || value === null) return;
    arr[fieldNumber - 1] = value;
};

const dense = arr => Array.from(arr, v => (v === undefined ? null : v));

const valueToJspb = v => {
    if (v === null || v === undefined) return [0];
    if (typeof v === "number") return [null, v];
    if (typeof v === "string") return [null, null, v];
    if (typeof v === "boolean") return [null, null, null, v];
    if (Array.isArray(v)) return [null, null, null, null, null, [v.map(valueToJspb)]];
    return [null, null, null, null, structToJspb(v)];
};

const structToJspb = obj => [Object.entries(obj || {}).map(([k, v]) => [k, valueToJspb(v)])];

const valueFromJspb = v => {
    if (!Array.isArray(v)) return null;
    if (v[1] !== undefined && v[1] !== null) return v[1];
    if (v[2] !== undefined && v[2] !== null) return v[2];
    if (v[3] !== undefined && v[3] !== null) return v[3];
    if (Array.isArray(v[4])) return structFromJspb(v[4]);
    if (Array.isArray(v[5])) return (v[5][0] || []).map(valueFromJspb);
    return null;
};

const structFromJspb = s => {
    const out = {};
    for (const entry of (Array.isArray(s) && s[0]) || []) {
        if (Array.isArray(entry)) out[entry[0]] = valueFromJspb(entry[1]);
    }
    return out;
};

const parseJspb = text => {
    let out = "";
    let inString = false;
    let escaped = false;
    let prev = "";
    for (const ch of text) {
        if (inString) {
            out += ch;
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            out += ch;
            prev = ch;
            continue;
        }
        if (/\s/.test(ch)) {
            out += ch;
            continue;
        }
        if ((ch === "," || ch === "]") && (prev === "[" || prev === ",")) {
            if (!(ch === "]" && prev === "[")) out += "null";
        }
        out += ch;
        prev = ch;
    }
    return JSON.parse(out);
};

const normalizeBase64 = data => {
    if (typeof data !== "string") return data;
    try {
        return Buffer.from(data, "base64").toString("base64");
    } catch {
        return data;
    }
};

const enumValue = (map, value) => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return undefined;
    return map[value.toUpperCase()];
};

const schemaToJspb = schema => {
    if (!schema || typeof schema !== "object") return undefined;
    const s = [];
    let type = schema.type;
    let nullable = schema.nullable;
    if (Array.isArray(type)) {
        nullable = nullable || type.some(t => String(t).toLowerCase() === "null");
        type = type.find(t => String(t).toLowerCase() !== "null");
    }
    setField(s, 1, enumValue(SCHEMA_TYPE, type));
    setField(s, 2, schema.format);
    setField(s, 3, schema.description);
    setField(s, 4, nullable);
    if (Array.isArray(schema.enum)) setField(s, 5, schema.enum.map(String));
    setField(s, 6, schemaToJspb(schema.items));
    if (schema.properties && typeof schema.properties === "object") {
        setField(
            s,
            7,
            Object.entries(schema.properties).map(([k, v]) => [k, dense(schemaToJspb(v) || [])])
        );
    }
    if (Array.isArray(schema.required)) setField(s, 8, schema.required);
    setField(s, 9, schema.minProperties);
    setField(s, 10, schema.maxProperties);
    setField(s, 11, schema.minimum);
    setField(s, 12, schema.maximum);
    setField(s, 13, schema.minLength);
    setField(s, 14, schema.maxLength);
    setField(s, 15, schema.pattern);
    if (schema.example !== undefined) setField(s, 16, valueToJspb(schema.example));
    const anyOf = schema.anyOf || schema.oneOf;
    if (Array.isArray(anyOf)) setField(s, 18, anyOf.map(x => dense(schemaToJspb(x) || [])));
    setField(s, 21, schema.maxItems);
    setField(s, 22, schema.minItems);
    if (Array.isArray(schema.propertyOrdering)) setField(s, 23, schema.propertyOrdering);
    setField(s, 24, schema.title);
    return dense(s);
};

const partToJspb = part => {
    const p = [];
    if (typeof part.text === "string") setField(p, 2, part.text);
    if (part.inlineData) setField(p, 3, [part.inlineData.mimeType, normalizeBase64(part.inlineData.data)]);
    if (part.fileData) setField(p, 7, [part.fileData.mimeType, part.fileData.fileUri]);
    if (part.executableCode) setField(p, 8, [1, part.executableCode.code]);
    if (part.codeExecutionResult) {
        const outcome = Math.max(0, CODE_OUTCOME.indexOf(part.codeExecutionResult.outcome));
        setField(p, 9, [outcome, part.codeExecutionResult.output]);
    }
    if (part.functionCall) {
        const fc = part.functionCall;
        setField(p, 11, dense([fc.name, structToJspb(fc.args), fc.id]));
    }
    if (part.functionResponse) {
        const fr = part.functionResponse;
        let response = fr.response;
        if (response === null || typeof response !== "object" || Array.isArray(response)) response = { result: response };
        setField(p, 12, dense([fr.name, structToJspb(response), fr.id]));
    }
    if (part.thought === true) setField(p, 13, true);
    if (typeof part.thoughtSignature === "string" && part.thoughtSignature) setField(p, 15, part.thoughtSignature);
    if (p.length === 0) setField(p, 2, "");
    return dense(p);
};

const contentToJspb = content => {
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return [parts.map(partToJspb), content.role || "user"];
};

const generationConfigToJspb = g => {
    if (!g || typeof g !== "object") return undefined;
    const c = [];
    setField(c, 1, g.candidateCount);
    if (Array.isArray(g.stopSequences) && g.stopSequences.length) setField(c, 2, g.stopSequences);
    setField(c, 4, g.maxOutputTokens);
    setField(c, 5, g.temperature);
    setField(c, 6, g.topP);
    setField(c, 7, g.topK);
    setField(c, 8, g.responseMimeType);
    setField(c, 9, schemaToJspb(g.responseSchema || g.responseJsonSchema || g._responseJsonSchema));
    setField(c, 10, g.presencePenalty);
    setField(c, 11, g.frequencyPenalty);
    setField(c, 12, g.responseLogprobs);
    setField(c, 13, g.logprobs);
    if (Array.isArray(g.responseModalities)) {
        const mods = g.responseModalities.map(m => enumValue(RESPONSE_MODALITY, m)).filter(Boolean);
        if (mods.length) setField(c, 15, mods);
    }
    if (g.thinkingConfig && typeof g.thinkingConfig === "object") {
        const t = g.thinkingConfig;
        const tc = [];
        setField(tc, 1, t.includeThoughts);
        setField(tc, 2, t.thinkingBudget);
        setField(tc, 4, enumValue(THINKING_LEVEL, t.thinkingLevel));
        if (tc.length) setField(c, 17, dense(tc));
    }
    setField(c, 19, g.seed);
    return dense(c);
};

const toolToJspb = tool => {
    const t = [];
    if (tool.codeExecution) setField(t, 1, []);
    if (Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length) {
        setField(
            t,
            2,
            tool.functionDeclarations.map(fd => {
                const d = [];
                setField(d, 1, fd.name);
                setField(d, 2, fd.description);
                setField(d, 3, schemaToJspb(fd.parameters));
                if (fd.parametersJsonSchema) setField(d, 6, valueToJspb(fd.parametersJsonSchema));
                return dense(d);
            })
        );
    }
    if (tool.googleSearchRetrieval) setField(t, 3, []);
    if (tool.googleSearch) setField(t, 4, []);
    if (tool.urlContext) setField(t, 8, []);
    return t.length ? dense(t) : null;
};

const geminiRequestToJspb = (model, body) => {
    const req = [];
    setField(req, 1, `models/${model}`);
    setField(req, 2, (body.contents || []).map(contentToJspb));
    const safety = (body.safetySettings || [])
        .map(s => [null, null, enumValue(HARM_CATEGORY, s.category), enumValue(HARM_THRESHOLD, s.threshold)])
        .filter(s => s[2] !== undefined && s[3] !== undefined);
    if (safety.length) setField(req, 3, safety);
    setField(req, 4, generationConfigToJspb(body.generationConfig));
    if (body.systemInstruction) {
        const si =
            typeof body.systemInstruction === "string"
                ? { parts: [{ text: body.systemInstruction }] }
                : body.systemInstruction;
        setField(req, 6, contentToJspb({ ...si, role: si.role || "user" }));
    }
    if (Array.isArray(body.tools)) {
        const tools = body.tools.map(toolToJspb).filter(Boolean);
        if (tools.length) setField(req, 7, tools);
    }
    const fcc = body.toolConfig && body.toolConfig.functionCallingConfig;
    if (fcc) {
        const f = [];
        setField(f, 1, enumValue(FUNCTION_CALLING_MODE, fcc.mode));
        if (Array.isArray(fcc.allowedFunctionNames) && fcc.allowedFunctionNames.length) {
            setField(f, 2, fcc.allowedFunctionNames);
        }
        if (f.length) setField(req, 14, [dense(f)]);
    }
    return dense(req);
};

const partFromJspb = p => {
    const part = {};
    if (!Array.isArray(p)) return part;
    if (typeof p[1] === "string") part.text = p[1];
    if (Array.isArray(p[2])) part.inlineData = { data: p[2][1], mimeType: p[2][0] };
    if (Array.isArray(p[6])) part.fileData = { fileUri: p[6][1], mimeType: p[6][0] };
    if (Array.isArray(p[7])) part.executableCode = { code: p[7][1], language: CODE_LANGUAGE[p[7][0]] || "PYTHON" };
    if (Array.isArray(p[8])) {
        part.codeExecutionResult = { outcome: CODE_OUTCOME[p[8][0]] || "OUTCOME_OK", output: p[8][1] };
    }
    if (Array.isArray(p[10])) {
        part.functionCall = { args: structFromJspb(p[10][1]), name: p[10][0] };
        if (p[10][2]) part.functionCall.id = p[10][2];
    }
    if (Array.isArray(p[11])) {
        part.functionResponse = { name: p[11][0], response: structFromJspb(p[11][1]) };
        if (p[11][2]) part.functionResponse.id = p[11][2];
    }
    // Playground marks thought parts with 1 (older responses used true).
    if (p[12] === true || p[12] === 1) part.thought = true;
    if (typeof p[14] === "string" && p[14]) part.thoughtSignature = p[14];
    return part;
};

const safetyRatingsFromJspb = ratings =>
    (Array.isArray(ratings) ? ratings : []).map(r => {
        const out = {
            category: HARM_CATEGORY_NAMES[r[2]] || `HARM_CATEGORY_${r[2]}`,
            probability: HARM_PROBABILITY[r[3]] || "HARM_PROBABILITY_UNSPECIFIED",
        };
        if (r[4] === true) out.blocked = true;
        return out;
    });

const usageFromJspb = u => {
    if (!Array.isArray(u)) return undefined;
    const out = {
        candidatesTokenCount: u[1] || 0,
        promptTokenCount: u[0] || 0,
        totalTokenCount: u[2] || 0,
    };
    if (u[3]) out.cachedContentTokenCount = u[3];
    if (Array.isArray(u[4])) {
        out.promptTokensDetails = u[4].map(d => ({ modality: MODALITY[d[0]] || "TEXT", tokenCount: d[1] || 0 }));
    }
    if (u[7]) out.toolUsePromptTokenCount = u[7];
    if (u[9]) out.thoughtsTokenCount = u[9];
    return out;
};

const isErrorElement = e => Array.isArray(e) && e[0] == null && Array.isArray(e[1]) && typeof e[1][1] === "string";
const isResponseElement = e => Array.isArray(e) && (Array.isArray(e[0]) || Array.isArray(e[1]) || Array.isArray(e[2]));

const chunkFromJspb = (r, model) => {
    const out = {
        candidates: (Array.isArray(r[0]) ? r[0] : []).map((c, i) => {
            const cand = {
                content: {
                    parts: ((Array.isArray(c[0]) && c[0][0]) || []).map(partFromJspb),
                    role: (Array.isArray(c[0]) && c[0][1]) || "model",
                },
                index: typeof c[2] === "number" ? c[2] : i,
            };
            if (typeof c[1] === "number") cand.finishReason = FINISH_REASON[c[1]] || "OTHER";
            if (typeof c[3] === "string") cand.finishMessage = c[3];
            if (Array.isArray(c[4])) cand.safetyRatings = safetyRatingsFromJspb(c[4]);
            return cand;
        }),
        modelVersion: model,
    };
    if (Array.isArray(r[1])) {
        out.promptFeedback = {};
        if (typeof r[1][0] === "number") out.promptFeedback.blockReason = BLOCK_REASON[r[1][0]] || "OTHER";
        if (Array.isArray(r[1][1])) out.promptFeedback.safetyRatings = safetyRatingsFromJspb(r[1][1]);
    }
    const usage = usageFromJspb(r[2]);
    if (usage) out.usageMetadata = usage;
    if (typeof r[7] === "string") out.responseId = r[7];
    return out;
};

const mergeChunks = (chunks, model) => {
    const merged = { candidates: [], modelVersion: model };
    for (const chunk of chunks) {
        for (const cand of chunk.candidates) {
            let target = merged.candidates.find(c => c.index === cand.index);
            if (!target) {
                target = { content: { parts: [], role: cand.content.role }, index: cand.index };
                merged.candidates.push(target);
            }
            for (const part of cand.content.parts) {
                const last = target.content.parts[target.content.parts.length - 1];
                const isText =
                    typeof part.text === "string" &&
                    Object.keys(part).every(k => ["text", "thought", "thoughtSignature"].includes(k));
                const lastIsText =
                    last &&
                    typeof last.text === "string" &&
                    Object.keys(last).every(k => ["text", "thought", "thoughtSignature"].includes(k));
                if (isText && lastIsText && !!last.thought === !!part.thought) {
                    last.text += part.text;
                    if (part.thoughtSignature) last.thoughtSignature = part.thoughtSignature;
                } else if (isText && part.text === "" && !part.thoughtSignature) {
                    continue;
                } else {
                    target.content.parts.push({ ...part });
                }
            }
            if (cand.finishReason) target.finishReason = cand.finishReason;
            if (cand.finishMessage) target.finishMessage = cand.finishMessage;
            if (cand.safetyRatings) target.safetyRatings = cand.safetyRatings;
        }
        if (chunk.promptFeedback) merged.promptFeedback = chunk.promptFeedback;
        if (chunk.usageMetadata) merged.usageMetadata = chunk.usageMetadata;
        if (chunk.responseId) merged.responseId = chunk.responseId;
    }
    return merged;
};

const parseGenerateContentResponse = (text, model) => {
    let data;
    try {
        data = parseJspb(text);
    } catch (e) {
        return {
            chunks: [],
            error: { code: 13, message: `Unparseable Playground response: ${String(text).slice(0, 200)}` },
        };
    }
    if (isErrorElement(data)) return { chunks: [], error: { code: data[1][0], message: data[1][1] } };
    let list = data;
    if (
        Array.isArray(data) &&
        data.length === 1 &&
        Array.isArray(data[0]) &&
        data[0].every(e => e === null || Array.isArray(e)) &&
        typeof (data[0][0] && data[0][0][0] && data[0][0][0][1]) !== "string"
    ) {
        list = data[0];
    }
    const elements = Array.isArray(list) && list.every(e => e === null || Array.isArray(e)) ? list : [list];
    const chunks = [];
    let error = null;
    for (const e of elements) {
        if (isErrorElement(e)) error = { code: e[1][0], message: e[1][1] };
        else if (isResponseElement(e)) chunks.push(chunkFromJspb(e, model));
    }
    if (chunks.length > 0) error = null;
    return { chunks, error };
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// PLAYGROUND_TRUSTED_INPUT=false falls back to the old JS setter / button.click() path.
const TRUSTED_INPUT = String(process.env.PLAYGROUND_TRUSTED_INPUT || "true").toLowerCase() !== "false";

// Extra Runs (fresh chat each) after a 403 before reporting the error.
const PERMISSION_RETRIES = Math.max(0, parseInt(process.env.PLAYGROUND_403_RETRIES || "3", 10) || 0);
const PERMISSION_RETRY_DELAY_MS = Math.max(0, parseInt(process.env.PLAYGROUND_403_RETRY_DELAY_MS || "3000", 10) || 0);
// How long to wait for the page to send GenerateContent after clicking Run.
const RUN_REQUEST_TIMEOUT_MS = Math.max(5000, parseInt(process.env.PLAYGROUND_RUN_TIMEOUT_MS || "20000", 10) || 20000);

const FILL_PROMPT_SCRIPT = prompt => `(() => {
  const visible = el => el && el.checkVisibility && el.checkVisibility({ visibilityProperty: true });
  const items = [...document.querySelectorAll("ms-prompt-box textarea")].filter(visible);
  if (items.length !== 1) throw new Error("prompt textarea count=" + items.length);
  const textarea = items[0];
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(textarea, ${JSON.stringify(prompt)});
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(prompt)} }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  return textarea.value;
})()`;

const CLICK_RUN_SCRIPT = `(() => {
  const visible = el => el && el.checkVisibility && el.checkVisibility({ visibilityProperty: true });
  const enabled = btn => btn && !btn.matches(":disabled") && !btn.closest('[aria-disabled="true"]');
  const items = [...document.querySelectorAll("ms-run-button button")].filter(visible);
  if (items.length !== 1) throw new Error("run button count=" + items.length);
  const button = items[0];
  if (!enabled(button)) throw new Error("run button disabled");
  button.click();
  return true;
})()`;

const DISMISS_OVERLAYS_SCRIPT = `(() => {
  const visible = el => el && el.checkVisibility && el.checkVisibility({ visibilityProperty: true });
  const enabled = btn => btn && !btn.matches(":disabled") && !btn.closest('[aria-disabled="true"]');
  let clicked = 0;
  const clickFirst = nodes => {
    for (const el of nodes) {
      if (visible(el) && enabled(el)) {
        el.click();
        clicked++;
        return true;
      }
    }
    return false;
  };
  clickFirst([...document.querySelectorAll('ms-g1-welcome-dialog button[aria-label="Close dialog"]')]);
  clickFirst([...document.querySelectorAll('button[aria-label="Close guided tour"]')]);
  clickFirst([...document.querySelectorAll('#glue-cookie-notification-bar-1 .glue-cookie-notification-bar__reject')]);
  for (const btn of document.querySelectorAll("button")) {
    const text = (btn.innerText || "").trim();
    if ((text === "Agree" || text === "Accept all" || text === "No thanks") && visible(btn) && enabled(btn)) {
      if (text === "Agree" || text === "Accept all") {
        btn.click();
        clicked++;
        break;
      }
    }
  }
  return clicked;
})()`;

const PROMPT_READY_SCRIPT = `(() => {
  const visible = el => el && el.checkVisibility && el.checkVisibility({ visibilityProperty: true });
  return [...document.querySelectorAll("ms-prompt-box textarea")].filter(visible).length === 1;
})()`;

const RUN_ENABLED_SCRIPT = `(() => {
  const visible = el => el && el.checkVisibility && el.checkVisibility({ visibilityProperty: true });
  const enabled = btn => btn && !btn.matches(":disabled") && !btn.closest('[aria-disabled="true"]');
  const items = [...document.querySelectorAll("ms-run-button button")].filter(visible);
  return items.length === 1 && enabled(items[0]);
})()`;

const promptFromGeminiBody = body => {
    const chunks = [];
    if (body.systemInstruction) {
        const si =
            typeof body.systemInstruction === "string"
                ? body.systemInstruction
                : (body.systemInstruction.parts || []).map(p => p.text || "").join("");
        if (si) chunks.push(`[system]\n${si}`);
    }
    for (const content of body.contents || []) {
        const role = content.role || "user";
        const text = (content.parts || [])
            .map(p => {
                if (typeof p.text === "string") return p.text;
                if (p.inlineData) return "[inline_data]";
                if (p.functionCall) return `[function_call ${p.functionCall.name || ""}]`;
                if (p.functionResponse) return `[function_response ${p.functionResponse.name || ""}]`;
                return "";
            })
            .filter(Boolean)
            .join("\n");
        if (text) chunks.push(`[${role}]\n${text}`);
    }
    return chunks.join("\n\n") || "ping";
};

const chatUrlForModel = model => {
    const m = encodeURIComponent(String(model || "gemini-flash-latest").replace(/^models\//, ""));
    const temporary = String(process.env.TEMPORARY_CHAT || "true").toLowerCase() !== "false";
    return `https://aistudio.google.com/prompts/new_chat?model=${m}${temporary ? "&temporary=true" : ""}`;
};

/** Drop hop-by-hop / browser-only headers that break Node HTTP response writing. */
const sanitizeResponseHeaders = headers => {
    const out = {};
    if (!headers || typeof headers !== "object") return { "content-type": "application/json" };
    for (const [rawKey, value] of Object.entries(headers)) {
        const key = String(rawKey || "").toLowerCase();
        if (!key) continue;
        if (
            key === "set-cookie" ||
            key === "set-cookie2" ||
            key === "connection" ||
            key === "keep-alive" ||
            key === "transfer-encoding" ||
            key === "content-encoding" ||
            key === "content-length" ||
            key.startsWith(":")
        ) {
            continue;
        }
        if (typeof value !== "string") continue;
        // Node rejects header values with raw CR/LF.
        if (/[\r\n]/.test(value)) continue;
        out[key] = value;
    }
    if (!out["content-type"]) out["content-type"] = "application/json";
    return out;
};

class PlaygroundBridge {
    constructor(logger) {
        this.logger = logger;
        this.readyByAuth = new Map();
        this._locks = new Map();
    }

    async _withLock(authIndex, fn) {
        const prev = this._locks.get(authIndex) || Promise.resolve();
        let release;
        const gate = new Promise(r => {
            release = r;
        });
        this._locks.set(
            authIndex,
            prev.then(() => gate)
        );
        await prev;
        try {
            return await fn();
        } finally {
            release();
        }
    }

    async _waitFor(page, expression, timeoutMs, label) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                if (await page.evaluate(expression)) return true;
            } catch (_) {
                /* retry */
            }
            await sleep(400);
        }
        throw new Error(`${label} timeout after ${timeoutMs}ms`);
    }

    async ensurePageReady(page, logPrefix = "[Playground]") {
        for (let i = 0; i < 6; i++) {
            try {
                await page.evaluate(DISMISS_OVERLAYS_SCRIPT);
            } catch (_) {
                /* ignore */
            }
            try {
                if (await page.evaluate(PROMPT_READY_SCRIPT)) break;
            } catch (_) {
                /* ignore */
            }
            await sleep(700);
        }
        await this._waitFor(page, PROMPT_READY_SCRIPT, 120000, `${logPrefix} prompt box`);
        try {
            await page.evaluate(DISMISS_OVERLAYS_SCRIPT);
        } catch (_) {
            /* ignore */
        }
    }

    async openFreshChat(page, model, logPrefix = "[Playground]") {
        const url = chatUrlForModel(model);
        this.logger.info(`${logPrefix} opening fresh chat: ${url}`);
        await page.goto(url, { timeout: 180000, waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200 + Math.random() * 800);
        await this.ensurePageReady(page, logPrefix);
    }

    async bootstrap(page, authIndex, model = "gemini-flash-latest") {
        const logPrefix = `[Playground#${authIndex}]`;
        await this.openFreshChat(page, model, logPrefix);
        this.readyByAuth.set(authIndex, { page, model });
        this.logger.info(`${logPrefix} UI-drive Playground ready (page-native WAA via Run)`);
        return true;
    }

    isReady(authIndex) {
        return this.readyByAuth.has(authIndex);
    }

    clear(authIndex) {
        this.readyByAuth.delete(authIndex);
    }

    async handleProxyRequest(authIndex, proxyRequest, enqueue) {
        return this._withLock(authIndex, async () => {
            const state = this.readyByAuth.get(authIndex);
            if (!state || !state.page || state.page.isClosed()) {
                enqueue({
                    event_type: "error",
                    message: `Playground UI not ready for auth #${authIndex}`,
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: 503,
                });
                return;
            }
            const page = state.page;
            const path = String(proxyRequest.path || "");
            const match = path.match(MODEL_PATH_RE);
            if (!match) {
                enqueue({
                    event_type: "error",
                    message: `Playground panel only supports generateContent paths, got ${path}`,
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: 400,
                });
                return;
            }
            const [, model, action] = match;
            if (action === "countTokens") {
                enqueue({
                    event_type: "error",
                    message: "countTokens not implemented on Playground panel yet",
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: 501,
                });
                return;
            }

            let body = {};
            try {
                body =
                    typeof proxyRequest.body === "string"
                        ? JSON.parse(proxyRequest.body || "{}")
                        : proxyRequest.body || {};
            } catch (e) {
                enqueue({
                    event_type: "error",
                    message: `Invalid JSON body: ${e.message}`,
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: 400,
                });
                return;
            }

            // No marker in the prompt (the model would see and comment on it): our GenerateContent is
            // identified as the first one for this model issued after the Run click (see below).
            const prompt = promptFromGeminiBody(body).slice(0, 200000);
            const started = Date.now();
            const logPrefix = `[Playground#${authIndex}]`;

            let responseText = "";
            let responseStatus = 0;
            let responseHeaders = {};
            // Model the page actually sent to Google (it can ignore ?model=); reported as modelVersion.
            let actualModel = model;

            try {
                // The page randomly gets 403 code 7 ("caller does not have permission") on Run; a fresh chat
                // and another Run usually succeeds. Retrying here covers streaming paths, which RequestHandler
                // does not retry for 403.
                for (let attempt = 1; attempt <= PERMISSION_RETRIES + 1; attempt++) {
                    // Fresh temporary chat each attempt: isolates history and selects model via URL.
                    await this.openFreshChat(page, model, logPrefix);
                    state.model = model;

                    if (TRUSTED_INPUT) {
                        // Real (isTrusted) keyboard input instead of a JS value setter.
                        await page.locator("ms-prompt-box textarea:visible").fill(prompt, { timeout: 30000 });
                    } else {
                        const filled = await page.evaluate(FILL_PROMPT_SCRIPT(prompt));
                        if (String(filled).replace(/\r\n/g, "\n") !== prompt.replace(/\r\n/g, "\n")) {
                            this.logger.warn(`${logPrefix} prompt fill mismatch (continuing)`);
                        }
                    }
                    await this._waitFor(page, RUN_ENABLED_SCRIPT, 30000, `${logPrefix} run button`);

                    // Listen only for requests issued from now on: the page's own bootstrap GenerateContent
                    // calls (often 403) were sent during load, so the first one after Run is ours. Not filtered
                    // by model: when the page ignores ?model= (keeps the previous chat's model), a model filter
                    // never matches and the request hangs until the timeout.
                    const requestPromise = page.waitForRequest(
                        req => {
                            try {
                                if (!req.url().includes("MakerSuiteService/GenerateContent")) return false;
                                return String(req.method() || "").toUpperCase() === "POST";
                            } catch (_) {
                                return false;
                            }
                        },
                        { timeout: RUN_REQUEST_TIMEOUT_MS }
                    );

                    if (TRUSTED_INPUT) {
                        // Real mouse move + click on the Run button (isTrusted events).
                        await page.locator("ms-run-button button:visible").click({ timeout: 30000 });
                    } else {
                        await page.evaluate(CLICK_RUN_SCRIPT);
                    }
                    let generateRequest;
                    try {
                        generateRequest = await requestPromise;
                    } catch (e) {
                        // Run did not fire a request: treat as a failed attempt and retry with a fresh chat.
                        this.logger.warn(
                            `${logPrefix} no GenerateContent within ${RUN_REQUEST_TIMEOUT_MS}ms after Run (attempt ${attempt}/${PERMISSION_RETRIES + 1})`
                        );
                        if (attempt > PERMISSION_RETRIES) throw e;
                        await sleep(PERMISSION_RETRY_DELAY_MS);
                        continue;
                    }
                    const sentModel = ((generateRequest.postData() || "").match(/^\["models\/([^"]+)"/) || [])[1];
                    if (sentModel && sentModel !== model) {
                        this.logger.warn(`${logPrefix} page sent model ${sentModel}, requested ${model}`);
                    }
                    actualModel = sentModel || model;
                    const res = await generateRequest.response();
                    if (!res) throw new Error("GenerateContent request failed without a response");
                    responseStatus = res.status();
                    responseHeaders = sanitizeResponseHeaders(await res.allHeaders().catch(() => ({})));
                    responseText = await res.text();
                    if (process.env.PLAYGROUND_DUMP_RAW === "true") {
                        // Debug only: raw JSPB response for protocol investigation.
                        require("fs").writeFileSync(`/app/data/pg-raw-${Date.now()}-${responseStatus}.txt`, responseText);
                    }
                    if (responseStatus === 200) break;

                    const postPreview = String(res.request().postData() || "")
                        .replace(/\s+/g, " ")
                        .slice(0, 180);
                    this.logger.warn(
                        `${logPrefix} matched GenerateContent HTTP ${responseStatus} (attempt ${attempt}/${PERMISSION_RETRIES + 1}); post≈${postPreview}`
                    );
                    if (responseStatus !== 403 || attempt > PERMISSION_RETRIES) break;
                    await sleep(PERMISSION_RETRY_DELAY_MS);
                }
            } catch (e) {
                this.logger.error(`${logPrefix} UI drive failed: ${e.message}`);
                enqueue({
                    event_type: "error",
                    message: `Playground UI drive failed: ${e.message}`,
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: 502,
                });
                return;
            }

            // Errors must be the first message for this attempt: RequestHandler only retries when the
            // initial message is an error, so sending response_headers first would skip the retry.
            if (responseStatus !== 200) {
                const parsed = parseGenerateContentResponse(responseText, model);
                const msg = (parsed.error && parsed.error.message) || String(responseText).slice(0, 400);
                this.logger.warn(`${logPrefix} ${model} HTTP ${responseStatus}: ${msg}`);
                enqueue({
                    event_type: "error",
                    message: msg,
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: responseStatus,
                });
                return;
            }

            const { chunks, error } = parseGenerateContentResponse(responseText, actualModel);
            if (error) {
                enqueue({
                    event_type: "error",
                    message: error.message || "Playground parse error",
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                    status: 502,
                });
                return;
            }

            enqueue({
                event_type: "response_headers",
                headers: responseHeaders || { "content-type": "application/json" },
                request_attempt_id: proxyRequest.request_attempt_id,
                request_id: proxyRequest.request_id,
                status: 200,
            });

            const mode = proxyRequest.streaming_mode || "fake";
            if (mode === "real") {
                for (const chunk of chunks) {
                    enqueue({
                        data: `data: ${JSON.stringify(chunk)}\n\n`,
                        event_type: "chunk",
                        request_attempt_id: proxyRequest.request_attempt_id,
                        request_id: proxyRequest.request_id,
                    });
                }
            } else {
                const merged = mergeChunks(chunks, actualModel);
                enqueue({
                    data: JSON.stringify(merged),
                    event_type: "chunk",
                    request_attempt_id: proxyRequest.request_attempt_id,
                    request_id: proxyRequest.request_id,
                });
            }
            enqueue({
                event_type: "stream_close",
                request_attempt_id: proxyRequest.request_attempt_id,
                request_id: proxyRequest.request_id,
            });
            const usage = (chunks[chunks.length - 1] && chunks[chunks.length - 1].usageMetadata) || {};
            this.logger.info(
                `${logPrefix} ${model} OK in ${Date.now() - started}ms ` +
                    `(prompt ${usage.promptTokenCount || 0}, output ${usage.candidatesTokenCount || 0})`
            );
        });
    }
}

module.exports = {
    PlaygroundBridge,
    _internal: {
        chatUrlForModel,
        geminiRequestToJspb,
        mergeChunks,
        parseGenerateContentResponse,
        parseJspb,
        promptFromGeminiBody,
        structFromJspb,
        structToJspb,
    },
};
