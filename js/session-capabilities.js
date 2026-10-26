/**
 * session-capabilities.js
 * What the application holds, and what a flow's New Lead dialog may offer with it: the reach of each
 * capability (`GET /api/app/capabilities`: production or sandbox) beside whether the application
 * itself runs in production (`GET /api/app`). A setting a capability holds is drawn as a box
 * (css/session-form.css) whose notice, inside it, says why the setting is held and names what to ask
 * for in the Console. A box wears a "Sandbox only" tag while its switch is held to sandbox, and nothing
 * otherwise: a "Production" tag beside a Sandbox switch reads as the opposite of it.
 */
(function () {
    'use strict';

    /** The reach of each capability (`production` or `sandbox`), once the service has answered. */
    const state = { known: false, reach: {} };

    /** Where production reach is asked for: a capability, or the application itself. */
    const CAPABILITIES_DOCS = 'https://infonite.dev/console/capabilities';
    const GO_LIVE_DOCS = 'https://infonite.dev/console/your-first-app#asking-for-production';

    /** What each capability is called in the Console, beside its code. */
    const NAMES = {
        'product:financial_rider': 'Financial Rider',
        'product:es_public_administration': 'Spain Public Administration',
        'login:tokenized_access': 'Tokenized access',
    };

    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

    /** Whether a capability reaches production. Unknown — an older service — gates nothing. */
    const reachesProduction = (capability) => !state.known || state.reach[capability] === 'production';

    /** Whether the application itself is a production one: a sandbox one never opens a production session. */
    function appInProduction() {
        const environment = window.InfoniteConfigManager?.getConfig()?.appDetails?.environment;
        return !environment || environment === 'production';
    }

    /** Whether a production session of a product may be asked for: the application and the product, both in production. */
    const productionAllowed = (product) => appInProduction() && reachesProduction(product);

    /** Reads the capabilities of the environment's application; an answer that does not come gates nothing. */
    async function load() {
        const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
        if (!config || config.isMock || !config.secret || !config.widgetUrl) return;
        try {
            const response = await fetch(`${config.widgetUrl}/api/app/capabilities`, { headers: { 'X-APP-SECRET': config.secret } });
            if (response.ok) {
                const rows = await response.json();
                state.reach = Object.fromEntries(rows.map(row => [row.capability, row.environment]));
                state.known = true;
            }
        } catch (e) {
            console.warn('The capabilities could not be read:', e);
        }
    }

    /** What to ask for, as the notice's button says it: the capability's name and code, into the Console. */
    const request = (capability) => ({ label: `Request ${NAMES[capability] || capability}`, code: capability, href: CAPABILITIES_DOCS });

    /** A box's notice: why its switch is held, and a button naming what to ask for, in a new tab. Null hides it. */
    function notice(id, value) {
        const box = document.getElementById(id);
        if (!box) return;
        box.classList.toggle('hidden', !value);
        if (!value) return;
        box.querySelector('.sf-cap-notice-text').textContent = value.text;
        const action = box.querySelector('.sf-cap-action');
        action.href = value.href;
        action.innerHTML = `<span>${escapeHtml(value.label)}</span>${value.code ? `<code>${escapeHtml(value.code)}</code>` : ''}<i class="fa-solid fa-arrow-up-right-from-square"></i>`;
    }

    /**
     * A product's Sandbox switch: held on while the application cannot open a production session of
     * the product, with its "Sandbox only" tag and its notice. True when production is allowed.
     * `real` says what a production session reaches, for the notice ("real banks").
     */
    function holdSandbox({ product, flow, real, switchId = 'generate-sandbox-mode', tagId, noticeId }) {
        const sandbox = document.getElementById(switchId);
        if (!sandbox) return true;
        const allowed = productionAllowed(product);
        if (!allowed) sandbox.checked = true;
        sandbox.disabled = !allowed;
        document.getElementById(tagId)?.classList.toggle('hidden', allowed);
        notice(noticeId, allowed ? null : appInProduction()
            ? {
                text: `This application runs ${flow} in sandbox only: production is not enabled for it yet. Ask for the capability in the Console to ${real}.`,
                ...request(product),
            }
            : {
                text: 'This is a sandbox application: every session it opens runs in sandbox. A production session needs the application in production.',
                label: 'Ask for production', href: GO_LIVE_DOCS,
            });
        return allowed;
    }

    window.InfoniteCapabilities = { load, reachesProduction, appInProduction, productionAllowed, request, notice, holdSandbox };
})();
