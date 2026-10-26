/**
 * session-request.js
 * The request a New Lead dialog is about to send, before it is sent: over the dialog, as raw HTTP or
 * as cURL, ready to copy — the same in every flow. It is built by the flow's own `buildLeadPayload`,
 * so it is exactly what Generate Session sends.
 *
 * The application's secret NEVER appears in it, not even on request: its header always carries a
 * placeholder to replace, so neither a demo on a shared screen nor a pasted snippet can leak it.
 */
(function () {
    'use strict';

    /** What stands where the secret goes, in every format. */
    const SECRET = '<YOUR_APP_SECRET>';

    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

    /** JSON as the results' viewer colours it: keys, strings, numbers, booleans and nulls, the rest escaped. */
    function highlightJson(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
                let kind = 'json-number';
                if (/^"/.test(match)) kind = /:$/.test(match) ? 'json-key' : 'json-string';
                else if (/true|false/.test(match)) kind = 'json-boolean';
                else if (/null/.test(match)) kind = 'json-null';
                return `<span class="${kind}">${match}</span>`;
            });
    }

    /** What is on screen: the request (its address, its body, or why the form cannot send one yet) and the format. */
    let request = null;
    let format = 'http';

    /** The request in a format, twice: as text to copy and as coloured HTML to read. */
    function compose(kind) {
        const { url, payload, error } = request;
        const json = payload ? JSON.stringify(payload, null, 2) : '';
        const span = (cls, text) => `<span class="${cls}">${escapeHtml(text)}</span>`;
        if (kind === 'curl') {
            // the body between single quotes, each quote inside it closed, escaped and reopened
            const body = json.replace(/'/g, `'\\''`);
            const text = [
                `curl -X POST '${url}' \\`,
                `  -H 'Content-Type: application/json' \\`,
                `  -H 'X-APP-SECRET: ${SECRET}'${payload ? ' \\' : ''}`,
                ...(payload ? [`  --data-raw '${body}'`] : []),
            ].join('\n');
            const html = [
                `${span('sr-command', 'curl')} ${span('sr-flag', '-X')} ${span('sr-method', 'POST')} ${span('sr-value', `'${url}'`)} ${span('sr-muted', '\\')}`,
                `  ${span('sr-flag', '-H')} ${span('sr-value', `'Content-Type: application/json'`)} ${span('sr-muted', '\\')}`,
                `  ${span('sr-flag', '-H')} ${span('sr-value', `'X-APP-SECRET: `)}${span('sr-secret', SECRET)}${span('sr-value', `'`)}${payload ? ` ${span('sr-muted', '\\')}` : ''}`,
                ...(payload ? [`  ${span('sr-flag', '--data-raw')} ${span('sr-value', `'`)}${highlightJson(body)}${span('sr-value', `'`)}`] : []),
            ].join('\n');
            return { text, html: error ? `${html}\n\n${span('sr-error', `# ${error}`)}` : html };
        }
        let address;
        try { address = new URL(url); } catch (e) { address = { host: '', pathname: url, search: '' }; }
        const text = [
            `POST ${address.pathname}${address.search} HTTP/1.1`,
            `Host: ${address.host}`,
            'Content-Type: application/json',
            `X-APP-SECRET: ${SECRET}`,
            '',
            json,
        ].join('\n');
        const html = [
            `${span('sr-method', 'POST')} ${span('sr-path', `${address.pathname}${address.search}`)} ${span('sr-muted', 'HTTP/1.1')}`,
            `${span('sr-header', 'Host')}${span('sr-muted', ':')} ${span('sr-value', address.host)}`,
            `${span('sr-header', 'Content-Type')}${span('sr-muted', ':')} ${span('sr-value', 'application/json')}`,
            `${span('sr-header', 'X-APP-SECRET')}${span('sr-muted', ':')} ${span('sr-secret', SECRET)}`,
            '',
            payload ? highlightJson(json) : span('sr-error', `// ${error}`),
        ].join('\n');
        return { text, html };
    }

    /** The viewer, built the first time it is opened. */
    function dialog() {
        let modal = document.getElementById('requestPreview');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'requestPreview';
        modal.className = 'fixed inset-0 z-[450] hidden items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6';
        modal.addEventListener('click', () => close());
        modal.innerHTML = `
    <div class="relative w-full max-w-4xl h-[calc(100vh-1.5rem)] md:h-[80vh] flex flex-col bg-[#1e1e1e] rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden border border-slate-700/50" role="dialog" aria-modal="true" aria-labelledby="requestPreviewTitle" onclick="event.stopPropagation()">
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-slate-700/50 bg-[#252526] shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <i class="fa-solid fa-code text-slate-400 shrink-0"></i>
                <div class="min-w-0">
                    <h3 class="text-sm font-bold text-slate-200 tracking-wide font-mono truncate" id="requestPreviewTitle">Initialization request</h3>
                    <p class="text-[11px] text-slate-400 truncate">What Generate Session sends, exactly</p>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <div class="sr-format" role="tablist" aria-label="Format">
                    <button type="button" role="tab" data-format="http" onclick="InfoniteRequestPreview.show('http')">HTTP</button>
                    <button type="button" role="tab" data-format="curl" onclick="InfoniteRequestPreview.show('curl')">cURL</button>
                </div>
                <button type="button" id="requestPreviewCopy" onclick="InfoniteRequestPreview.copy()" class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600/50 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors">
                    <i class="fa-regular fa-copy"></i> <span>COPY</span>
                </button>
                <button type="button" onclick="InfoniteRequestPreview.close()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Close">
                    <i class="fa-solid fa-times text-lg"></i>
                </button>
            </div>
        </div>
        <div class="flex items-center gap-2 px-4 md:px-6 py-2.5 bg-[#2d2d30] border-b border-slate-700/50 text-[11px] text-slate-400 shrink-0">
            <i class="fa-solid fa-key text-amber-400"></i>
            <span>The app secret is never shown: replace <code class="sr-secret">${escapeHtml(SECRET)}</code> with your application's secret.</span>
        </div>
        <div class="flex-1 overflow-auto custom-scrollbar bg-[#1e1e1e]">
            <pre class="m-0 p-6 text-[13px] leading-snug font-mono text-[#d4d4d4] whitespace-pre"><code id="requestPreviewCode"></code></pre>
        </div>
    </div>`;
        document.body.appendChild(modal);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
        return modal;
    }

    /** Draws the request in a format: its text, the format's tab, and whether there is anything to copy. */
    function show(kind = format) {
        format = kind === 'curl' ? 'curl' : 'http';
        if (!request) return;
        const modal = dialog();
        modal.querySelectorAll('.sr-format button').forEach(button => button.classList.toggle('is-on', button.dataset.format === format));
        document.getElementById('requestPreviewCode').innerHTML = compose(format).html;
        const copyButton = document.getElementById('requestPreviewCopy');
        copyButton.disabled = !request.payload;
        copyButton.classList.toggle('opacity-40', !request.payload);
    }

    /**
     * Opens the viewer with the request a flow is about to send: `flow` names it in the address,
     * `build` is the flow's own payload builder. A form not ready to send says why instead of a body.
     */
    function open({ flow, build }) {
        const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
        const base = String(config?.widgetUrl || 'https://<widgets host>').replace(/\/+$/, '');
        let payload = null;
        let error = '';
        try {
            payload = build();
        } catch (e) {
            error = `The form is not ready to send yet: ${e.message}`;
        }
        request = { url: `${base}/api/flows/${flow}/v1/manager/init`, payload, error };
        const modal = dialog();
        show(format);
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function close() {
        const modal = document.getElementById('requestPreview');
        if (!modal || modal.classList.contains('hidden')) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    /** Copies the request as it is drawn — the secret's placeholder included; the button says it is done. */
    function copy() {
        if (!request?.payload) return;
        const button = document.getElementById('requestPreviewCopy');
        const label = button?.querySelector('span');
        const say = (text) => {
            if (!label) return;
            label.textContent = text;
            setTimeout(() => { label.textContent = 'COPY'; }, 1800);
        };
        const writing = navigator.clipboard?.writeText(compose(format).text);
        (writing || Promise.reject(new Error('No clipboard'))).then(() => say('COPIED'), () => say('NOT COPIED'));
    }

    window.InfoniteRequestPreview = { open, show, close, copy };
})();
