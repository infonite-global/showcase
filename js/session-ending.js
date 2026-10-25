/**
 * session-ending.js
 * Where a demo session ends, the same in every flow: a preset — nothing (the final screen, and a
 * message to the parent of an iframe), a redirect to one of the application's URLs, a WhatsApp chat,
 * or the flow's own overview on infonite.dev — read against the application's redirect URLs with the
 * core's own rule, and remembered with the environment (js/config.js, each flow's own store).
 *
 * A page mounts it once into its Advanced section, with a `#se-summary` on that section's header, and
 * then asks it for `settings()` when it builds the session request, `sync()` while its dialog is open
 * (the application's URLs may arrive after it) and `remember()` once a session was created.
 * Styles: css/session-ending.css.
 */
(function () {
    'use strict';

    /** What a redirect by hand adds to its URL: which session and how it ended, never data. */
    const REDIRECT_QUERY = { session: '{session_id}', status: '{status_code}', customer: '{customer_id}' };

    /** The country codes the WhatsApp number offers, the demo's markets first. */
    const DIAL_CODES = [
        { iso: 'ES', code: '34' }, { iso: 'CO', code: '57' }, { iso: 'MX', code: '52' }, { iso: 'AR', code: '54' },
        { iso: 'CL', code: '56' }, { iso: 'PE', code: '51' }, { iso: 'PT', code: '351' }, { iso: 'FR', code: '33' },
        { iso: 'IT', code: '39' }, { iso: 'DE', code: '49' }, { iso: 'GB', code: '44' }, { iso: 'US', code: '1' },
    ];

    const CONSOLE_APP_SETTINGS = 'https://www.infonite.tech/console/app-settings/';
    const DEFAULT_MESSAGE = 'I want to apply for my loan. Session ID: {session_id}';

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

    /** A country's flag, drawn by Twemoji from its ISO code: an emoji flag does not show on every system. */
    function flagUrl(iso) {
        const points = [...String(iso).toUpperCase()].map(letter => (0x1f1e6 + letter.charCodeAt(0) - 65).toString(16));
        return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${points.join('-')}.svg`;
    }

    /** The flow the page mounted it for: its store, its docs and the event its widget posts. */
    let flow = null;
    /** Where the section stands: set once from the last session or the default, then only kept in step. */
    const state = { urls: null, touched: false };

    const appRedirectUrls = () => window.InfoniteConfigManager?.getConfig()?.app_settings?.redirect_urls || [];
    /** Where the infonite.dev preset lands: this flow's overview, and never anything else. */
    const docsLanding = () => `${flow.docs}/overview`;

    /** A URL as the core compares it: its origin (scheme, host and port) and its path. Null if not http(s). */
    function redirectParts(text) {
        try {
            const url = new URL(text);
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
            const port = url.port || (url.protocol === 'https:' ? '443' : '80');
            return { host: url.hostname, origin: `${url.protocol}//${url.hostname}:${port}`, path: url.pathname || '/' };
        } catch (e) {
            return null;
        }
    }

    /**
     * Whether a session may send the person to `target`: the core's own rule (`allows_redirect_to`) —
     * the same scheme, host and port as a registered URL, and a path that starts with its path.
     */
    function allowsRedirect(target) {
        const wanted = redirectParts(target);
        return !!wanted && appRedirectUrls().some(url => {
            const registered = redirectParts(url);
            return !!registered && registered.origin === wanted.origin && wanted.path.startsWith(registered.path);
        });
    }

    /**
     * The WhatsApp destination the application registered, wa.me before the legacy endpoint, or null.
     * A wa.me URL registered with a number in it fixes that number; registered bare, the number is typed.
     */
    function whatsappTarget() {
        const registered = appRedirectUrls().map(url => ({ url, ...redirectParts(url) })).filter(r => r.host);
        const short = registered.find(r => r.host === 'wa.me' && r.origin.startsWith('https:'));
        if (short) {
            const fixed = short.path.replace(/\/+$/, '');
            return { kind: 'wa.me', registered: short.url, fixed: fixed ? `https://wa.me${fixed}` : null };
        }
        const legacy = registered.find(r => r.host === 'api.whatsapp.com' && r.origin.startsWith('https:'));
        const send = legacy && `https://api.whatsapp.com${legacy.path.startsWith('/send') ? legacy.path : '/send'}`;
        return send && allowsRedirect(send) ? { kind: 'api', registered: legacy.url, url: send } : null;
    }

    const endingPreset = () => document.querySelector('input[name="se-ending"]:checked')?.value || 'nothing';
    const redirectTab = () => document.querySelector('input[name="se-redirect-tab"]:checked')?.value || 'redirect';

    /**
     * How a session ends when nothing was chosen before: on this flow's docs for an application that lists
     * infonite.dev — the right place for whoever is trying the demo — and on the final screen otherwise.
     */
    const defaultEnding = () => (allowsRedirect(docsLanding()) ? 'infonite' : 'nothing');

    /** The address the person lands on, as the platform builds it: the URL, then the extra data as a query. */
    function landingUrl(url, extra) {
        const encode = (text) => encodeURIComponent(text).replace(/%20/g, '+').replace(/%7B(\w+)%7D/g, '{$1}');
        const query = Object.entries(extra || {}).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
        return query ? `${url}?${query}` : url;
    }

    /** The same address, its template variables marked: they are filled in when the session ends. */
    const landingHtml = (url) => escapeHtml(url).replace(/\{(\w+)\}/g, '<span class="se-var-inline">{$1}</span>');

    /**
     * The WhatsApp number in international form, digits only, or null while it is not one. A number typed
     * with its own prefix (+57…, 0057…) is taken whole; otherwise the country code goes first, and the
     * national trunk zero goes away — except in Italy, where it is part of the number.
     */
    function whatsappPhone() {
        const typed = ($('se-wa-number')?.value || '').trim();
        const digits = typed.replace(/\D/g, '');
        const dial = $('se-wa-dial')?.value || '';
        const phone = /^(\+|00)/.test(typed)
            ? digits.replace(/^00/, '')
            : dial + (dial === '39' ? digits : digits.replace(/^0+/, ''));
        return digits && /^\d{8,15}$/.test(phone) ? phone : null;
    }

    /** The settings a preset gives the session, or what it still needs, as an error a person can act on. */
    function settings(preset = endingPreset()) {
        if (preset === 'nothing') return { completion_mode: 'do_nothing' };

        if (preset === 'infonite') {
            if (!allowsRedirect(docsLanding())) throw new Error("This application does not list https://infonite.dev/ among its redirect URLs: choose another ending.");
            return { completion_mode: 'redirect', completion_url: docsLanding() };
        }

        if (preset === 'whatsapp') {
            const target = whatsappTarget();
            if (!target) throw new Error("Add https://wa.me/ to this application's redirect URLs to end the session in WhatsApp: Console → App Settings → Redirect URLs.");
            const text = ($('se-wa-text')?.value || '').trim();
            if (target.kind === 'wa.me' && target.fixed) {
                return { completion_mode: 'redirect', completion_url: target.fixed, ...(text ? { completion_extra_data: { text } } : {}) };
            }
            const phone = whatsappPhone();
            if (!phone) throw new Error("Type the WhatsApp number the person will write to: the country code, then the number.");
            return target.kind === 'wa.me'
                ? { completion_mode: 'redirect', completion_url: `https://wa.me/${phone}`, ...(text ? { completion_extra_data: { text } } : {}) }
                : { completion_mode: 'redirect', completion_url: target.url, completion_extra_data: { phone, ...(text ? { text } : {}) } };
        }

        const base = ($('se-redirect-url')?.value || '').trim();
        if (!base) throw new Error("This application has no redirect URL to send the person to: register one first, or choose another ending.");
        const path = ($('se-redirect-path')?.value || '').trim();
        return {
            completion_mode: redirectTab(),
            completion_url: path ? base.replace(/\/$/, '') + '/' + path.replace(/^\//, '') : base,
            completion_extra_data: { ...REDIRECT_QUERY },
        };
    }

    // The last session's ending is remembered with the environment, in the flow's own store: the next lead starts from it
    const readCache = () => window.InfoniteConfigManager?.getFlowSettings(flow.key).ending || null;

    function remember() {
        const value = (id) => $(id)?.value ?? '';
        const stored = window.InfoniteConfigManager.getFlowSettings(flow.key);
        stored.ending = {
            preset: endingPreset(), tab: redirectTab(), url: value('se-redirect-url'), path: value('se-redirect-path'),
            dial: value('se-wa-dial'), number: value('se-wa-number'), text: value('se-wa-text'),
        };
        window.InfoniteConfigManager.saveFlowSettings(flow.key, stored);
    }

    /** Puts an ending back on the form. A preset the application no longer allows falls back to the default. */
    function applyEnding(saved) {
        const check = (name, value) => {
            const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (input) input.checked = true;
        };
        check('se-ending', saved.preset === 'infonite' && !allowsRedirect(docsLanding()) ? defaultEnding() : saved.preset);
        if (saved.tab) check('se-redirect-tab', saved.tab);
        if (saved.url && appRedirectUrls().includes(saved.url)) $('se-redirect-url').value = saved.url;
        const fill = (id, value) => { if (typeof value === 'string' && $(id)) $(id).value = value; };
        fill('se-redirect-path', saved.path);
        if (saved.dial && DIAL_CODES.some(d => d.code === saved.dial)) fill('se-wa-dial', saved.dial);
        fill('se-wa-number', saved.number);
        fill('se-wa-text', saved.text);
    }

    /**
     * Keeps the ending in step with the application's redirect URLs, which may arrive after the dialog
     * opens: the options, which presets can be used, the chosen one's panel and the Advanced header's
     * summary. Until the person touches the section, it follows the last session's ending, or the default.
     */
    function sync() {
        if (!flow) return;
        const urls = appRedirectUrls();
        const key = urls.join('\n');
        if (key !== state.urls) {
            state.urls = key;
            const select = $('se-redirect-url');
            const previous = select.value;
            select.innerHTML = urls.map(url => `<option value="${escapeHtml(url)}">${escapeHtml(url)}</option>`).join('');
            if (urls.includes(previous)) select.value = previous;
            if (!state.touched) applyEnding(readCache() || { preset: defaultEnding() });
        }
        render();
    }

    function onChange() {
        state.touched = true;
        render();
    }

    function insertVariable(variable) {
        const area = $('se-wa-text');
        const at = area.selectionStart ?? area.value.length;
        area.value = area.value.slice(0, at) + variable + area.value.slice(area.selectionEnd ?? at);
        area.focus();
        area.selectionStart = area.selectionEnd = at + variable.length;
        onChange();
    }

    function render() {
        const urls = appRedirectUrls();
        const whatsapp = whatsappTarget();
        const docs = allowsRedirect(docsLanding());

        // The tiles: infonite.dev only for an application that lists it; the others always, muted until set up
        const tile = (name) => document.querySelector(`.se-preset[data-preset="${name}"]`);
        const ready = (name, isReady) => {
            tile(name).classList.toggle('is-unavailable', !isReady);
            const hint = tile(name).querySelector('.se-preset-hint');
            hint.textContent = isReady ? hint.dataset.ready : hint.dataset.setup;
        };
        tile('infonite').classList.toggle('hidden', !docs);
        ready('redirect', urls.length > 0);
        ready('whatsapp', !!whatsapp);
        const grid = $('se-presets');
        grid.classList.toggle('grid-cols-3', !docs);
        grid.classList.toggle('grid-cols-2', docs);
        grid.classList.toggle('sm:grid-cols-4', docs);
        if (!docs && endingPreset() === 'infonite') document.querySelector('input[name="se-ending"][value="nothing"]').checked = true;

        const preset = endingPreset();
        document.querySelectorAll('[data-ending-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.endingPanel !== preset));

        // REDIRECT: the tab it opens in, said plainly, and where the person lands
        $('se-redirect-form').classList.toggle('hidden', !urls.length);
        $('se-redirect-none').classList.toggle('hidden', urls.length > 0);
        $('se-redirect-tab-hint').textContent = redirectTab() === 'redirect_blank'
            ? 'After a short countdown, the widget opens the URL in a new tab. The browser may block that as a pop-up: the final screen keeps a link to it.'
            : "After a short countdown on the final screen, the widget's own page goes to the URL. Inside an iframe, it is the iframe that navigates.";
        const manual = urls.length ? (() => { try { return settings('redirect'); } catch (e) { return null; } })() : null;
        $('se-redirect-preview').innerHTML = manual ? landingHtml(landingUrl(manual.completion_url, manual.completion_extra_data)) : '';

        // WHATSAPP: through which destination, the number (typed, or fixed by the registered URL) and the message
        $('se-wa-form').classList.toggle('hidden', !whatsapp);
        $('se-wa-setup').classList.toggle('hidden', !!whatsapp);
        if (whatsapp) {
            $('se-wa-via').innerHTML = whatsapp.kind === 'wa.me'
                ? `Through <code>${escapeHtml(whatsapp.registered)}</code>, registered on this application.`
                : `Through <code>${escapeHtml(whatsapp.registered)}</code>, registered on this application. Add <code>https://wa.me/</code> as well, and the shorter address is used.`;
            const fixed = whatsapp.kind === 'wa.me' && whatsapp.fixed;
            $('se-wa-phone').classList.toggle('hidden', !!fixed);
            const fixedNote = $('se-wa-phone-fixed');
            fixedNote.classList.toggle('hidden', !fixed);
            if (fixed) fixedNote.innerHTML = `The number is fixed by the registered URL: <code>${escapeHtml(fixed)}</code>.`;
            const dial = $('se-wa-dial');
            const iso = dial.selectedOptions[0]?.dataset.iso;
            const flag = $('se-wa-flag');
            if (iso && flag.dataset.iso !== iso) {
                flag.src = flagUrl(iso);
                flag.dataset.iso = iso;
            }
            const typed = $('se-wa-number').value.trim();
            $('se-wa-phone').classList.toggle('is-invalid', !!typed && !whatsappPhone());
            const whatsappSettings = (() => { try { return settings('whatsapp'); } catch (e) { return null; } })();
            $('se-wa-preview').innerHTML = whatsappSettings
                ? landingHtml(landingUrl(whatsappSettings.completion_url, whatsappSettings.completion_extra_data))
                : '<span class="text-slate-400">Type the number to see it</span>';
        }

        $('se-infonite-preview').textContent = docsLanding();
        $('se-infonite-open').href = docsLanding();
        renderSummary(preset, urls, whatsapp);
    }

    /** Where the session ends, on the Advanced header: seen without opening the section. */
    function renderSummary(preset, urls, whatsapp) {
        const summary = $('se-summary');
        if (!summary) return;
        const pill = (icon, text, warning = false) => {
            summary.classList.toggle('is-warning', warning);
            summary.innerHTML = `<i class="${icon}"></i> ${escapeHtml(text)}`;
        };
        if (preset === 'infonite') return pill('fa-solid fa-book-open', 'infonite.dev');
        if (preset === 'whatsapp') return pill('fa-brands fa-whatsapp', whatsapp ? 'WhatsApp' : 'WhatsApp · set up', !whatsapp);
        if (preset === 'redirect') {
            const host = redirectParts($('se-redirect-url').value)?.host;
            return pill('fa-solid fa-diamond-turn-right', host || 'Redirect · no URL', !host);
        }
        return pill('fa-regular fa-circle-stop', 'Final screen');
    }

    /** The section itself: the tiles, then one panel per preset, each with its way into the docs. */
    function markup() {
        const guide = `${flow.docs}/redirects`;
        const docLink = (anchor, label, extra = '') =>
            `<a class="se-doc-link${extra}" href="${guide}${anchor}" target="_blank" rel="noopener"><i class="fa-solid fa-book-open"></i> ${label}</a>`;
        const consoleLink = `<a class="se-doc-link" href="${CONSOLE_APP_SETTINGS}" target="_blank" rel="noopener"><i class="fa-solid fa-gauge-high"></i> Open the Console</a>`;
        const preset = (name, icon, title, hint, setup) => `
            <label class="se-preset${name === 'infonite' ? ' hidden' : ''}" data-preset="${name}">
              <input type="radio" name="se-ending" value="${name}" class="sr-only">
              <span class="se-preset-face"><i class="${icon}"></i><span class="se-preset-title">${title}</span><span class="se-preset-hint"${setup ? ` data-ready="${hint}" data-setup="${setup}"` : ''}>${hint}</span></span>
            </label>`;
        const tab = (value, icon, label, checked) => `
            <label class="se-segment cursor-pointer">
              <input type="radio" name="se-redirect-tab" value="${value}" class="sr-only"${checked ? ' checked' : ''}>
              <span class="se-segment-face gap-1.5"><i class="${icon}"></i> ${label}</span>
            </label>`;
        const variable = (name) => `<button type="button" class="se-var" data-se-variable="{${name}}">{${name}}</button>`;

        return `
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[10px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                <i class="fa-solid fa-flag-checkered text-blue-500"></i> When the session ends
              </span>
              ${docLink('', 'Redirects')}
            </div>

            <div id="se-presets" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              ${preset('nothing', 'fa-regular fa-circle-stop', 'Do nothing', 'Final screen')}
              ${preset('redirect', 'fa-solid fa-diamond-turn-right', 'Redirect', 'One of your URLs', 'No URL yet')}
              ${preset('whatsapp', 'fa-brands fa-whatsapp', 'WhatsApp', 'Opens a chat', 'Needs set-up')}
              ${preset('infonite', 'fa-solid fa-book-open', 'infonite.dev', "This flow's docs")}
            </div>
            <p class="se-scope"><i class="fa-solid fa-clock-rotate-left"></i> The last session's ending is remembered in this browser with the environment, and the environment's setup link carries it.</p>

            <div class="se-panel" data-ending-panel="nothing">
              <p class="se-panel-text">The person stays on the widget's final screen. Embedded in an iframe, your page still hears the session end: the widget posts a <code>${flow.event}</code> message to its parent, with the status, so you can close the frame or move on.</p>
              <pre class="se-code"><code>window.addEventListener('message', (event) =&gt; {
  if (event.data?.event === '${flow.event}') closeWidget();
});</code></pre>
              ${docLink('#iframe-postmessage-events', 'Listening to the widget', ' self-start')}
            </div>

            <div class="se-panel hidden" data-ending-panel="redirect">
              <div id="se-redirect-form" class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="se-field-label">Opens in</span>
                  <div class="inline-flex p-1 bg-white border border-black/5 rounded-xl gap-1">
                    ${tab('redirect', 'fa-regular fa-window-maximize', 'Same tab', true)}
                    ${tab('redirect_blank', 'fa-solid fa-up-right-from-square', 'New tab', false)}
                  </div>
                </div>
                <p id="se-redirect-tab-hint" class="se-panel-hint"></p>
                <div class="flex flex-col gap-1.5">
                  <label for="se-redirect-url" class="se-field-label">Redirect URL</label>
                  <select id="se-redirect-url" class="se-input font-mono truncate"></select>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="se-redirect-path" class="se-field-label">Custom sub path</label>
                  <input type="text" id="se-redirect-path" placeholder="/onboarding/success" class="se-input font-mono">
                  <p class="se-panel-hint">Optional, appended to the URL. It has to stay under one of the application's redirect URLs.</p>
                </div>
                <div class="se-preview"><span>Where the person lands</span><code id="se-redirect-preview"></code></div>
                <div class="flex flex-wrap gap-2">
                  ${docLink('#completion-modes', 'Completion modes')}
                  ${docLink('#dynamic-query-parameters--templating', 'Query and variables')}
                </div>
              </div>
              <div id="se-redirect-none" class="hidden flex flex-col gap-3">
                <p class="se-panel-text">This application has no redirect URL yet. A session only sends people to an address registered on the application — in the Console, <strong>App Settings → Redirect URLs</strong>.</p>
                <div class="flex flex-wrap gap-2">
                  ${consoleLink}
                  ${docLink('#where-to-register-them', 'Where to register them')}
                </div>
              </div>
            </div>

            <div class="se-panel hidden" data-ending-panel="whatsapp">
              <div id="se-wa-form" class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p id="se-wa-via" class="se-panel-hint"></p>
                  ${docLink('#redirecting-to-whatsapp', 'WhatsApp redirects')}
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="se-wa-number" class="se-field-label">Phone</label>
                  <div id="se-wa-phone" class="se-phone">
                    <img id="se-wa-flag" class="se-phone-flag" alt="" draggable="false">
                    <select id="se-wa-dial" aria-label="Country code"></select>
                    <input type="tel" id="se-wa-number" inputmode="tel" autocomplete="off" placeholder="600 000 000">
                  </div>
                  <p id="se-wa-phone-fixed" class="hidden se-panel-hint"></p>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="se-wa-text" class="se-field-label">Message</label>
                  <textarea id="se-wa-text" rows="2" class="se-input resize-none">${escapeHtml(flow.message)}</textarea>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="se-panel-hint">Insert</span>
                    ${variable('session_id')}
                    ${variable('customer_id')}
                    ${variable('status_code')}
                  </div>
                </div>
                <div class="se-preview"><span>Where the person lands</span><code id="se-wa-preview"></code></div>
              </div>
              <div id="se-wa-setup" class="hidden flex flex-col gap-3">
                <div class="flex items-start gap-3">
                  <span class="se-wa-badge"><i class="fa-brands fa-whatsapp"></i></span>
                  <div class="flex flex-col gap-1 min-w-0">
                    <p class="text-[11px] font-black text-slate-900">End the session in a WhatsApp chat</p>
                    <p class="se-panel-text">Add <code>https://wa.me/</code> to this application's redirect URLs, in the Console. The session can then end on <code>https://wa.me/&lt;phone&gt;</code>: a chat with your number and a message already written, the session ID in it, so whoever answers knows which session is writing.</p>
                  </div>
                </div>
                <pre class="se-code"><code>"completion_mode": "redirect",
"completion_url": "https://wa.me/34600000000",
"completion_extra_data": {
  "text": "${escapeHtml(DEFAULT_MESSAGE)}"
}</code></pre>
                <div class="flex flex-wrap gap-2">
                  ${consoleLink}
                  ${docLink('#redirecting-to-whatsapp', 'WhatsApp redirects')}
                </div>
              </div>
            </div>

            <div class="se-panel hidden" data-ending-panel="infonite">
              <p class="se-panel-text">The person lands on this flow's overview, at infonite.dev: the next step for whoever is trying the demo. The address is fixed, with no sub path and no query.</p>
              <div class="se-preview se-preview-open">
                <span>Where the person lands</span>
                <code id="se-infonite-preview"></code>
                <a class="se-preview-go" id="se-infonite-open" target="_blank" rel="noopener" title="Open it in a new tab"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
              </div>
              ${docLink('', 'Redirects', ' self-start')}
            </div>
          </div>`;
    }

    /**
     * Draws the section into `container` for one flow: `flow` is its store's key (js/config.js), `docs`
     * the flow's root on infonite.dev, `event` the message its widget posts to an iframe's parent.
     */
    function mount({ container, flow: key, docs, event, message = DEFAULT_MESSAGE }) {
        const root = typeof container === 'string' ? $(container) : container;
        if (!root) return;
        flow = { key, docs, event, message };
        state.urls = null;
        state.touched = false;
        root.innerHTML = markup();
        $('se-wa-dial').innerHTML = DIAL_CODES.map(({ iso, code }) => `<option value="${code}" data-iso="${iso}">${iso} +${code}</option>`).join('');
        $('se-wa-dial').value = '34';
        root.addEventListener('change', onChange);
        root.addEventListener('input', onChange);
        root.addEventListener('click', (e) => {
            const button = e.target.closest('[data-se-variable]');
            if (button) insertVariable(button.dataset.seVariable);
        });
        sync();
    }

    /** The host a session's completion URL sends the person to, for a summary; empty if it is not a URL. */
    const hostOf = (url) => redirectParts(url)?.host || '';

    window.InfoniteSessionEnding = { mount, sync, settings: () => settings(), remember, hostOf };
})();
