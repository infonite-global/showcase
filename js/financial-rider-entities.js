/**
 * financial-rider-entities.js
 * What both Financial Rider pages know about the entities: their logos and flags, the engine
 * catalogue, and which bank each product of a unified position comes from. The position merges what
 * every bank returned, so a product is told apart by its entity code — the IBAN's bank code, a card's
 * issuer — matched against the engines the session connected, whose code ends with the same country
 * and entity (`SANTANDERXXXFIN100ES0049` is Spain, entity 0049).
 */

/** An engine's logo, from the public assets host, built from its code: the square one, or the wide one. */
function engineLogoUrl(reference, shape = 'square') {
    const code = String(reference || '').split('-')[0];
    return `https://assets.infonite.dev/engine-logos/${code}/light-${shape}.png`;
}

/** A country's flag, drawn by Twemoji from its ISO code: an emoji flag does not show on every system. */
function flagUrl(iso) {
    const points = [...String(iso).toUpperCase()].map(letter => (0x1f1e6 + letter.charCodeAt(0) - 65).toString(16));
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${points.join('-')}.svg`;
}

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/**
 * Where the Direct Executions API answers for this environment: the widgets host with "clients" in
 * its place (widgets.infonite.tech → clients.infonite.tech), and on a developer's machine the port
 * beside it (2283 → 2282).
 */
function clientsApiUrl(widgetUrl) {
    return String(widgetUrl || '').replace('widgets', 'clients').replace(':2283', ':2282').replace(/\/$/, '');
}

/** The demo's own list, for when the catalogue cannot be read: references only, no names. */
function fallbackEngines() {
    return (window.INFONITE_ALL_BANKS_ENGINES || []).map(reference => ({
        reference, engine_code: reference.split('-')[0], name: null, markets: [], sub_categories: [], keywords: []
    }));
}

/** The financial engines of an environment, from `GET /config/engines/list` — or the demo's own list when it cannot be read. */
async function fetchEngineList(environment) {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    const base = clientsApiUrl(config?.widgetUrl);
    try {
        if (!config || config.isMock || !config.secret) throw new Error('No application selected');
        const response = await fetch(`${base}/api/config/engines/list?main_category=financial&environment=${environment}`, {
            headers: { 'X-APP-SECRET': config.secret }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const engines = await response.json();
        return { engines: engines.sort((a, b) => (a.name || a.reference).localeCompare(b.name || b.reference)), source: 'api' };
    } catch (e) {
        console.warn('The engine catalogue could not be read:', e);
        return { engines: fallbackEngines(), source: `fallback:${base || 'no environment'}` };
    }
}

// --------------------------------------------------------------------------------
// Which bank a product comes from
// --------------------------------------------------------------------------------

/** An entity as the position names it: its country and its code, without the zeros a code is padded with. */
const entityKey = (country, code) => `${String(country || '').toUpperCase()}:${String(code || '').replace(/^0+(?=.)/, '')}`;

/** The entity an engine reads, from its code: the country and the entity are its last six characters. */
function entityOfEngine(reference) {
    const code = String(reference || '').split('-')[0];
    return code.length === 24 ? entityKey(code.slice(18, 20), code.slice(20, 24)) : null;
}

/**
 * The entity a product of the position belongs to: its own entity code (a card's issuer), else its
 * account identifier's (the IBAN's bank code), else the one of the account it is linked to. Null
 * when the product says none.
 */
function entityOfProduct(product) {
    if (!product || typeof product !== 'object') return null;
    const sources = [product, product.identifier, product.account, product.linked_account];
    const named = sources.find(source => source && typeof source === 'object' && source.entity_code);
    return named ? entityKey(named.entity_country || product.entity_country, named.entity_code) : null;
}

/**
 * The bank of the session a product belongs to: by country and entity — or by entity alone when the
 * product names no country, as a generic identifier may not. Null when no connection reads it.
 */
function bankOfProduct(banks, product) {
    const key = entityOfProduct(product);
    if (!key) return null;
    if (banks.has(key)) return banks.get(key);
    const [country, code] = key.split(':');
    return country ? null : [...banks.values()].find(bank => bank.entity === code) || null;
}

/**
 * The banks a session connected, by entity: each with the engines that read it (two brands of one
 * bank share its entity code), their names from the catalogue and the connections that ran them.
 */
function bankDirectory(connections, catalogue) {
    const entries = new Map((catalogue || []).map(engine => [String(engine.engine_code || String(engine.reference || '').split('-')[0]), engine]));
    const banks = new Map();
    Object.entries(connections || {}).forEach(([execution, reference]) => {
        const key = entityOfEngine(reference);
        if (!key) return;
        const code = String(reference).split('-')[0];
        const entry = entries.get(code);
        const bank = banks.get(key) || { key, country: key.split(':')[0], entity: key.split(':')[1], engines: [], executions: [] };
        if (!bank.engines.some(engine => engine.code === code)) bank.engines.push({ code, reference, name: entry?.name || null, color: declaredColor(entry?.color_primary) });
        bank.executions.push(execution);
        banks.set(key, bank);
    });
    banks.forEach(bank => {
        bank.name = bank.engines.map(engine => engine.name || engine.code).join(' · ');
        bank.color = bank.engines.find(engine => engine.color)?.color || null;
    });
    return banks;
}

/** An engine's own colours, or null: `#1c252e` is the catalogue's default, what an engine that declares none carries. */
function declaredColor(set) {
    const hex = (value) => (typeof value === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : null);
    const main = hex(set?.main);
    if (!main || main.toLowerCase() === '#1c252e') return null;
    return { main, light: hex(set.light) || main, dark: hex(set.dark) || hex(set.darker) || main, contrast: hex(set.contrast_text) || hex(set.contrastText) };
}
