// Reads only modelVersion from upstream JSON/SSE before API format conversion.
class UpstreamModelReader {
    constructor() {
        this.buffer = "";
        this.finished = false;
        this.isSse = false;
        this.modelVersion = null;
        this.truncated = false;
    }

    consume(message) {
        if (this.finished) return;
        if (message.event_type === "response_headers") {
            const contentType = Object.entries(message.headers || {}).find(
                ([name]) => name.toLowerCase() === "content-type"
            )?.[1];
            this.isSse = typeof contentType === "string" && contentType.includes("text/event-stream");
        } else if (message.event_type === "chunk" && typeof message.data === "string" && !this.truncated) {
            this.buffer += message.data;
            if (/^\s*(?:data:|:)/.test(this.buffer)) this.isSse = true;
            if (this.isSse) this._readEvents();
            // Bound extra memory for non-streaming bodies or an unfinished SSE event.
            if (this.buffer.length > 8 * 1024 * 1024) {
                this.buffer = "";
                this.truncated = true;
            }
        } else if (message.event_type === "stream_close" || message.event_type === "error") {
            this.finish();
        }
    }

    _readEvents() {
        let boundary;
        while ((boundary = this.buffer.match(/\r?\n\r?\n/))) {
            this._readEvent(this.buffer.slice(0, boundary.index));
            this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
        }
    }

    _readEvent(event) {
        const data = event
            .split(/\r?\n/)
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).replace(/^ /, ""))
            .join("\n");
        if (data && data !== "[DONE]") this._readJson(data);
    }

    _readJson(data) {
        let response;
        try {
            response = JSON.parse(data);
        } catch {
            return;
        }
        // Do not inspect generated text or use the requested model as a fallback.
        if (response && !Array.isArray(response) && typeof response.modelVersion === "string") {
            const model = response.modelVersion.trim();
            if (model && model.length <= 200) this.modelVersion = model;
        }
    }

    finish() {
        if (this.finished) return;
        this.finished = true;
        if (this.isSse) {
            this._readEvents();
            if (this.buffer.trim()) this._readEvent(this.buffer);
        } else if (this.buffer.trim()) {
            this._readJson(this.buffer);
        }
        this.buffer = "";
    }
}

module.exports = UpstreamModelReader;
