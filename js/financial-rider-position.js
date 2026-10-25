/**
 * financial-rider-position.js
 * A Financial Rider session's results, drawn the way a bank draws its global position: the banks
 * the person connected and what each holds, every product under its bank, an account's or a card's
 * movements, and the person's profile behind their avatar. A session whose banks returned two
 * different people says so on every screen.
 *
 * Every amount is one the bank returned, product by product. The one sum on any screen is what a
 * securities account holds of one kind (3 stocks, 3.000 €): it adds only the valuations the bank
 * gave, and never two currencies.
 *
 * It reads the results page's state — FR_RESULTS, inScope(), the session (currentSessionData) and
 * its environment (configObj) — and the entity helpers of financial-rider-entities.js. Styles:
 * css/financial-rider-position.css.
 */
(function () {
    'use strict';

    const FAMILIES = [
        { key: 'accounts', title: 'Accounts', one: 'account', many: 'accounts', icon: 'fa-solid fa-piggy-bank', features: ['accounts_read'], blurb: 'Current and savings accounts, with their balances and movements.' },
        { key: 'cards', title: 'Cards', one: 'card', many: 'cards', icon: 'fa-solid fa-credit-card', features: ['cards_read'], blurb: 'Debit, credit and prepaid cards, with their limits and movements.' },
        { key: 'deposits', title: 'Deposits', one: 'deposit', many: 'deposits', icon: 'fa-solid fa-vault', features: ['deposits_read'], blurb: 'Term deposits and savings products.' },
        { key: 'loans', title: 'Loans', one: 'loan', many: 'loans', icon: 'fa-solid fa-hand-holding-dollar', features: ['loans_read'], blurb: 'Loans and mortgages, with what is left to pay.' },
        { key: 'investments', title: 'Investments', one: 'portfolio', many: 'portfolios', icon: 'fa-solid fa-chart-line', features: ['investment_accounts_read', 'stocks_read', 'funds_read', 'pensions_read'], blurb: 'Securities accounts and what each one holds: stocks, funds and pension plans.' },
        { key: 'direct_debits', title: 'Direct debits', one: 'direct debit', many: 'direct debits', icon: 'fa-solid fa-money-bill-transfer', features: ['direct_debits_read'], blurb: 'The direct debits the banks hold, with their charges and the last receipt.' },
    ];

    /** What a securities account holds, kind by kind, in the order a bank's position lists them. */
    const HOLDING_KINDS = [
        { key: 'stocks', title: 'Stocks', one: 'stock', many: 'stocks', icon: 'fa-solid fa-chart-column' },
        { key: 'funds', title: 'Funds', one: 'fund', many: 'funds', icon: 'fa-solid fa-layer-group' },
        { key: 'pensions', title: 'Pension plans', one: 'pension plan', many: 'pension plans', icon: 'fa-solid fa-umbrella' },
    ];

    // ---------------------------------------------------------------- reading the results

    const results = () => window.currentResultData || {};
    const data = () => results().data || {};
    const esc = (value) => escapeHtml(value ?? '');
    /** Whether the bank returned an amount: a number, never an empty or `NaN` placeholder. */
    const has = (money) => !!money && money.amount !== null && money.amount !== undefined && money.amount !== '' && Number.isFinite(Number(money.amount));
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const kindOf = (subFamily) => (subFamily ? String(subFamily).split(':').pop().replace(/_/g, ' ') : '');
    const titleCase = (text) => String(text || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());

    /** A name as the bank wrote it, with one repair: capitals whose accented letters came small («MI PRéSTAMO») are capitals throughout. */
    function tidy(text) {
        const value = String(text ?? '').trim();
        return /[a-z]/.test(value) || !/\p{Ll}/u.test(value) ? value : value.toUpperCase();
    }

    /** A product's name: its alias when the alias is a name (some banks put a number there), else the product's. */
    function nameOf(product, fallback) {
        const alias = product.product_alias;
        return tidy(alias && /\p{L}/u.test(alias) ? alias : product.product_name || alias || fallback);
    }

    /** What the bank says the product is, when that is more than its name. */
    function describe(product) {
        const text = tidy(product.product_description);
        return text && text.toLowerCase() !== nameOf(product, '').toLowerCase() ? text : '';
    }

    /** A card's holder as the plastic embosses it: some banks separate name and surnames with an asterisk. */
    const holderName = (name) => tidy(String(name || '').replace(/\*/g, ' '));

    // ---------------------------------------------------------------- how a figure is written

    const formats = new Map();
    const formatter = (key, build) => formats.get(key) || formats.set(key, build()).get(key);

    /**
     * An amount in the house's notation, grouped at every size: the Spanish default leaves four
     * digits ungrouped, and 6541,73 € beside 11.000,00 € reads as two different styles.
     */
    function money(value, { sign = false, decimals = 2 } = {}) {
        if (!has(value)) return '—';
        const shape = { minimumFractionDigits: Math.min(2, decimals), maximumFractionDigits: decimals, useGrouping: 'always', signDisplay: sign ? 'exceptZero' : 'auto' };
        const currency = /^[A-Z]{3}$/.test(value.currency || '') ? value.currency : null;
        if (!currency) {
            const number = formatter(`n${decimals}${sign}`, () => new Intl.NumberFormat('es-ES', shape)).format(Number(value.amount));
            return `${number} ${esc(value.currency || '')}`.trim();
        }
        return formatter(`${currency}${decimals}${sign}`, () => new Intl.NumberFormat('es-ES', { style: 'currency', currency, ...shape })).format(Number(value.amount));
    }

    /** A rate or a return as people read it: «6,025 %», «+36,48 %». Empty when the bank gave none. */
    function pct(rate, { sign = false } = {}) {
        if (!rate || !Number.isFinite(Number(rate.value)) || rate.value === '' || rate.value === null) return '';
        const number = formatter(`p${sign}`, () => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, signDisplay: sign ? 'exceptZero' : 'auto' })).format(Number(rate.value));
        return `${number} ${esc(rate.unit || '%')}`;
    }

    /** A quantity without the bank's trailing zeros: `12.456600` is 12,4566. Empty when there is none. */
    function qty(value) {
        if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '';
        return formatter('q', () => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6, useGrouping: 'always' })).format(Number(value));
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    /** A calendar date, never moved by the reader's time zone: «07 Oct 2026» (or «Oct 2026»). */
    function day(value, { month = false } = {}) {
        if (!value) return '—';
        const text = String(value);
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
        if (Number.isNaN(date.getTime())) return esc(text);
        const tail = `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
        return month ? tail : `${String(date.getUTCDate()).padStart(2, '0')} ${tail}`;
    }

    /** A product's life in one line: «Dec 2024 – Dec 2028». */
    const term = (from, to) => (from || to ? `${day(from, { month: true })} – ${day(to, { month: true })}` : '');

    /** A card's expiry the way the plastic prints it: `2030-12-31` is 12/30. */
    const expiry = (value) => (/^\d{4}-\d{2}/.test(String(value || '')) ? `${String(value).slice(5, 7)}/${String(value).slice(2, 4)}` : '');

    /** An IBAN or a card number in groups of four, its mask as dots: «ES10 0182 •••• •••• •••• 0198». Other numbers as they came. */
    function grouped(identifier, { full = false } = {}) {
        const text = String((full ? identifier?.value || identifier?.masked : identifier?.masked || identifier?.value) || '').replace(/\s+/g, '');
        if (!text) return '';
        return ['iban', 'pan'].includes(identifier?.type) ? text.replace(/\*/g, '•').replace(/(.{4})(?=.)/g, '$1 ') : text;
    }

    /** The end of a number, for where the whole one does not fit: «•••• 0198». */
    const tail = (identifier) => {
        const text = String(identifier?.masked || identifier?.value || '').replace(/\s+/g, '');
        return text ? `•••• ${text.slice(-4)}` : '';
    };

    const TONES = { active: 'is-ok', booked: 'is-ok', pending: 'is-warn', suspended: 'is-warn', blocked: 'is-warn', cancelled: 'is-off', expired: 'is-off', failed: 'is-bad', reversed: 'is-bad' };
    const statusTag = (status) => (status && status !== 'unknown' ? `<span class="frp-tag ${TONES[status] || 'is-quiet'}">${esc(kindOf(status))}</span>` : '');
    const kindTag = (subFamily) => (subFamily ? `<span class="frp-tag">${esc(kindOf(subFamily))}</span>` : '');
    const signOf = (value) => (has(value) ? (Number(value.amount) < 0 ? 'is-negative' : Number(value.amount) > 0 ? 'is-positive' : '') : '');
    const signOfRate = (rate) => (rate && Number.isFinite(Number(rate.value)) ? (Number(rate.value) < 0 ? 'is-negative' : Number(rate.value) > 0 ? 'is-positive' : '') : '');

    // ---------------------------------------------------------------- the products, bank by bank

    /** The family's products that the bank filter lets through. */
    function productsOf(familyKey, scoped = true) {
        const items = (Array.isArray(data()[familyKey]) ? data()[familyKey] : []).map(product => ({ product }));
        return scoped ? items.filter(item => inScope(item.product)) : items;
    }

    /** Whether the session was created to read the family at all. */
    function requested(family) {
        const features = requestedFeatures();
        return !features.length || family.features.some(code => features.includes(code));
    }

    /** The products, bank by bank in the order the session connected them, the unmatched last. */
    function byBank(items, bankOf = (item) => bankOfProduct(FR_RESULTS.banks, item.product)) {
        const groups = [...FR_RESULTS.banks.values()].map(bank => ({ bank, items: [] }));
        const unmatched = { bank: null, items: [] };
        items.forEach(item => {
            const bank = bankOf(item);
            (bank ? groups.find(group => group.bank.key === bank.key) : unmatched).items.push(item);
        });
        return [...groups, unmatched].filter(group => group.items.length);
    }

    const bankLogo = (bank, size = '') => bank
        ? `<span class="frp-logo ${size}"><img src="${engineLogoUrl(bank.engines[0].code)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'), {className: 'fa-solid fa-building-columns'}))"></span>`
        : `<span class="frp-logo ${size} is-unknown"><i class="fa-solid fa-circle-question"></i></span>`;

    /** The name of a bank no connection of the session reads: its entity code, if the product gives one. */
    function strangerName(product) {
        const entity = (entityOfProduct(product) || '').split(':').pop();
        return entity ? `Entity ${entity}` : 'Unknown bank';
    }

    /** A product's bank in a line: its logo and name, or the entity no connection reads. */
    function bankLine(product, bank = bankOfProduct(FR_RESULTS.banks, product)) {
        return `${bankLogo(bank, 'xs')}<span>${esc(bank ? bank.name : strangerName(product))}</span>`;
    }

    /** The session's own account an identifier names, when the session read it. */
    const idOf = (identifier) => (identifier && typeof identifier === 'object' ? String(identifier.value || '').replace(/\s+/g, '').toUpperCase() : '');
    function accountNamed(identifier) {
        const key = idOf(identifier);
        return key ? (data().accounts || []).find(account => idOf(account.identifier) === key) || null : null;
    }

    /** A fact naming an account: a way to it when the session read it, with its number's end under; its number's end otherwise. */
    function accountFact(label, identifier, options = {}) {
        if (!identifier || !(identifier.masked || identifier.value)) return null;
        const account = accountNamed(identifier);
        const number = `<span class="frp-mono" title="${esc(grouped(identifier))}">${esc(tail(identifier))}</span>`;
        if (!account) return fact(label, number, options);
        const link = `<button type="button" class="frp-inline-link" title="${esc(grouped(identifier))}" onclick="event.stopPropagation(); FRP.showAccount('${esc(account.id)}')"><span>${esc(nameOf(account, 'Account'))}</span><i class="fa-solid fa-chevron-right"></i></button>`;
        return fact(label, link, { ...options, sub: number });
    }

    // ---------------------------------------------------------------- securities accounts and what they hold

    /** Whether a holding sits in a securities account: the account it names is that one. */
    function holds(account, product) {
        const mine = account.identifier;
        const named = product.account;
        if (!idOf(mine) || idOf(mine) !== idOf(named)) return false;
        return !mine.entity_code || !named.entity_code || mine.entity_code === named.entity_code;
    }

    /**
     * The investments as portfolios: each securities account the bank returned, with the holdings
     * that name it, and — bank by bank — one more for the holdings no returned account holds, grouped
     * by the account they name when they name one.
     */
    function portfolios(scoped = true) {
        const own = data().investments || {};
        const list = (Array.isArray(own.accounts) ? own.accounts : [])
            .filter(account => !scoped || inScope(account))
            .map(account => ({ account, bank: bankOfProduct(FR_RESULTS.banks, account), named: null, holdings: [] }));
        const loose = new Map();
        HOLDING_KINDS.forEach(kind => (Array.isArray(own[kind.key]) ? own[kind.key] : []).forEach(product => {
            if (scoped && !inScope(product)) return;
            const home = list.find(folio => holds(folio.account, product));
            if (home) return home.holdings.push({ product, kind: kind.key });
            const bank = bankOfProduct(FR_RESULTS.banks, product);
            const key = `${bank?.key || '?'}|${idOf(product.account)}`;
            if (!loose.has(key)) loose.set(key, { account: null, bank, named: idOf(product.account) ? product.account : null, holdings: [] });
            loose.get(key).holdings.push({ product, kind: kind.key });
        }));
        return [...list, ...loose.values()];
    }

    const folioTitle = (folio) => (folio.account ? nameOf(folio.account, 'Securities account') : folio.named ? `Securities account ${folio.named.value}` : 'Outside a securities account');

    /**
     * The sum of the valuations the bank gave, currency by currency: a holding without one adds
     * nothing, and two currencies are never added together.
     */
    function sumOf(products) {
        const valued = products.filter(product => has(product.valuation));
        const cents = new Map();
        valued.forEach(({ valuation }) => cents.set(valuation.currency || '', (cents.get(valuation.currency || '') || 0) + Math.round(Number(valuation.amount) * 100)));
        const text = [...cents].map(([currency, total]) => money({ amount: total / 100, currency })).join(' + ');
        const missing = products.length - valued.length;
        return { text, note: missing ? `The sum of the ${plural(valued.length, 'valuation', 'valuations')} the bank returned: ${plural(missing, 'holding has', 'holdings have')} none.` : 'The sum of the valuations the bank returned.' };
    }

    /** What a portfolio holds, kind by kind: how many, and what their valuations add up to. */
    function composition(folio) {
        const parts = HOLDING_KINDS.map(kind => {
            const own = folio.holdings.filter(holding => holding.kind === kind.key).map(holding => holding.product);
            if (!own.length) return '';
            const total = sumOf(own);
            return `<span class="frp-comp" title="${esc(total.text ? total.note : '')}"><i class="${kind.icon}"></i>${plural(own.length, kind.one, kind.many)}${total.text ? `<b>${total.text}</b>` : ''}</span>`;
        }).join('');
        return parts || '<span class="frp-comp is-empty"><i class="fa-regular fa-folder-open"></i>No holdings returned</span>';
    }

    /** How a bank's investments read in a chip: its securities accounts, and the holdings outside them. */
    function investmentCount(products) {
        const accounts = products.filter(entry => entry.family === 'investments.accounts').map(entry => entry.product);
        const loose = products.filter(entry => entry.family !== 'investments.accounts' && !accounts.some(account => holds(account, entry.product))).length;
        const parts = [
            accounts.length ? plural(accounts.length, 'securities account', 'securities accounts') : '',
            loose ? plural(loose, accounts.length ? 'other holding' : 'holding', accounts.length ? 'other holdings' : 'holdings') : '',
        ].filter(Boolean);
        return parts.length ? `<span class="frp-count"><i class="fa-solid fa-chart-line"></i>${parts.join(' · ')}</span>` : '';
    }

    // ---------------------------------------------------------------- the person

    const profile = () => data().customer?.profile || null;

    /** The flag a session raises when its banks returned different people, if it did. */
    const crossedIdentity = () => (results().messages || []).find(message => message.message_id === 'crossed_identity') || null;
    const identityMismatch = () => (results().messages || []).find(message => message.message_id === 'profile_identity_mismatch') || null;

    function initials(person) {
        const first = String(person?.name || '').trim();
        const last = String(person?.name_extra || '').trim();
        return ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase() || '?';
    }

    /** The banner every screen of the position carries while the banks disagree on who the person is. */
    function renderIdentityBanner() {
        const box = document.getElementById('identityBanner');
        if (!box) return;
        const flag = crossedIdentity();
        box.classList.toggle('hidden', !flag);
        if (!flag) return;
        const detail = identityMismatch()?.message;
        box.innerHTML = `
            <span class="frp-identity-icon"><i class="fa-solid fa-people-arrows"></i></span>
            <div class="frp-identity-text">
                <strong>Crossed identity</strong>
                <span>${esc(flag.message || 'Two banks returned a different identity for this session.')}</span>
                ${detail ? `<small>${esc(detail)}</small>` : ''}
            </div>
            <button type="button" class="frp-identity-link" onclick="switchDashboardView('audit')">Details <i class="fa-solid fa-chevron-right"></i></button>`;
    }

    /** The bar over every view: which bank, and the person whose position it is. */
    function renderBar() {
        const bar = document.getElementById('bankFilter');
        if (!bar) return;
        const banks = [...FR_RESULTS.banks.values()];
        const unmatched = allProducts(data()).some(({ product }) => isUnmatched(product));
        const chips = [{ key: 'all', label: 'All banks', icon: '<i class="fa-solid fa-layer-group"></i>' }]
            .concat(banks.map(bank => ({ key: bank.key, label: bank.name, icon: `<img src="${engineLogoUrl(bank.engines[0].code)}" alt="" onerror="this.remove()">` })))
            .concat(unmatched ? [{ key: 'unmatched', label: 'Not matched', icon: '<i class="fa-solid fa-circle-question"></i>' }] : []);
        const person = profile();
        const filters = chips.length > 2 || unmatched ? `
            <div class="frp-bar-banks">
                <span class="frp-bar-label">Bank</span>
                ${chips.map(chip => `<button type="button" class="fr-bank-filter ${FR_RESULTS.filter === chip.key ? 'is-on' : ''}" onclick="setBankFilter('${chip.key}')">${chip.icon}<span>${esc(chip.label)}</span></button>`).join('')}
            </div>` : '<div class="frp-bar-banks"></div>';
        const me = person ? `
            <button type="button" class="frp-me" onclick="FRP.openProfile()" title="The customer's profile">
                <span class="frp-avatar">${esc(initials(person))}${crossedIdentity() ? '<i class="frp-avatar-alert fa-solid fa-exclamation"></i>' : ''}</span>
                <span class="frp-me-name">${esc(titleCase(person.name || 'Customer'))}</span>
                <i class="fa-solid fa-chevron-down"></i>
            </button>` : '';
        bar.classList.remove('hidden');
        bar.innerHTML = filters + me;
        renderIdentityBanner();
        renderRailCounts();
    }

    /** The rail's counts: how many of each family the bank filter lets through; a family with none goes quiet. */
    function renderRailCounts() {
        document.querySelectorAll('.frp-rail-item [data-count]').forEach(slot => {
            let n = 0;
            try { n = slot.dataset.count === 'investments' ? portfolios().length : productsOf(slot.dataset.count).length; } catch { n = 0; }
            slot.textContent = n ? String(n) : '';
            slot.closest('.frp-rail-item')?.classList.toggle('is-empty', !n);
        });
    }

    // ---------------------------------------------------------------- the profile, behind the avatar

    function field(label, value) {
        return `<div class="frp-field"><span>${label}</span><b>${value || '—'}</b></div>`;
    }

    /** An address in one line, the way the bank split it. */
    function addressLine(address) {
        if (address.full_text) return address.full_text;
        const place = [address.zip_code || address.postal_code, address.municipality || address.city].filter(Boolean).join(' ');
        const city = address.city && address.city !== address.municipality ? titleCase(address.city) : '';
        return [[address.street, address.number, address.street_extra].filter(Boolean).join(' '), place, city, address.state || address.region].filter(Boolean).join(', ');
    }

    function openProfile() {
        const person = profile();
        if (!person) return;
        let modal = document.getElementById('frpProfile');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'frpProfile';
            modal.className = 'frp-modal';
            modal.addEventListener('click', (event) => { if (event.target === modal) closeProfile(); });
            document.body.appendChild(modal);
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeProfile(); });
        }
        const documents = (person.identification_numbers || []).map(doc => `
            <div class="frp-doc"><span>${esc(String(doc.type || '').split(':').pop().toUpperCase())}</span><b>${esc(doc.value)}</b>${doc.validated ? '<i class="fa-solid fa-circle-check" title="Validated"></i>' : ''}</div>`).join('');
        const addresses = (person.addresses || []).map(address => `
            <div class="frp-address"><i class="fa-solid fa-location-dot"></i><span>${esc(addressLine(address) || '—')}${address.title ? ` <em class="frp-tag is-quiet">${esc(address.title)}</em>` : ''}</span>${address.country ? `<img src="${flagUrl(address.country)}" alt="">` : ''}</div>`).join('');
        const flag = crossedIdentity();
        modal.innerHTML = `
            <div class="frp-modal-panel" role="dialog" aria-modal="true" aria-label="Customer profile">
                <button type="button" class="frp-modal-close" onclick="FRP.closeProfile()" title="Close"><i class="fa-solid fa-xmark"></i></button>
                <div class="frp-profile-head">
                    <span class="frp-avatar lg">${esc(initials(person))}</span>
                    <div class="min-w-0">
                        <h3>${esc(titleCase([person.name, person.name_extra].filter(Boolean).join(' ')))}</h3>
                        <div class="frp-profile-tags">
                            ${person.type ? `<span class="frp-tag">${person.type === 'company' ? 'Legal entity' : 'Natural person'}</span>` : ''}
                            ${person.alias ? `<span class="frp-tag is-quiet">“${esc(person.alias)}”</span>` : ''}
                        </div>
                    </div>
                </div>
                ${flag ? `<div class="frp-identity is-inline"><span class="frp-identity-icon"><i class="fa-solid fa-people-arrows"></i></span><div class="frp-identity-text"><strong>Crossed identity</strong><span>The banks disagree on who this person is: this profile is the first bank's.</span></div></div>` : ''}
                <div class="frp-profile-section">
                    <span class="frp-section-label">Identity</span>
                    <div class="frp-docs">${documents || '<span class="frp-muted">No document returned.</span>'}</div>
                    <div class="frp-fields">
                        ${field('Born', day(person.birth_date))}
                        ${field('Gender', esc(titleCase(person.gender)))}
                        ${field('Civil status', esc(titleCase(person.civil_status)))}
                        ${field('Nationality', person.nationality_country ? `<img src="${flagUrl(person.nationality_country)}" alt=""> ${esc(person.nationality_country)}` : '')}
                        ${field('Residence', person.residence_country ? `<img src="${flagUrl(person.residence_country)}" alt=""> ${esc(person.residence_country)}` : '')}
                        ${field('Customer since', person.member_since ? day(person.member_since) : '')}
                    </div>
                </div>
                <div class="frp-profile-section">
                    <span class="frp-section-label">Contact</span>
                    <div class="frp-fields is-wide">
                        ${(person.emails || []).map(mail => field('Email', esc(mail))).join('') || field('Email', '')}
                        ${(person.phones || []).map(phone => field('Phone', esc(phone))).join('') || field('Phone', '')}
                    </div>
                </div>
                <div class="frp-profile-section">
                    <span class="frp-section-label">Addresses</span>
                    ${addresses || '<span class="frp-muted">No address returned.</span>'}
                </div>
            </div>`;
        modal.classList.add('is-open');
        document.body.classList.add('overflow-hidden');
    }

    function closeProfile() {
        document.getElementById('frpProfile')?.classList.remove('is-open');
        document.body.classList.remove('overflow-hidden');
    }

    // ---------------------------------------------------------------- the pieces a product is drawn with

    /** The figure a product is read by in a list, or null when the bank returned none. */
    function headline(familyKey, p) {
        const pick = (...pairs) => pairs.find(([, value]) => has(value)) || null;
        const found = {
            accounts: () => pick(['Available', p.available], ['Booked', p.booked]),
            cards: () => pick(['Used', p.disposed], ['Available', p.available]),
            deposits: () => pick(['Balance', p.balance], ['Available', p.available]),
            loans: () => pick(['Outstanding', p.outstanding_balance]),
            direct_debits: () => pick(['Last charge', lastCharge(p)?.amount]),
        }[familyKey]?.();
        return found ? { label: found[0], value: found[1] } : null;
    }

    /** The headline figure of a card: its label over it, both flush right, and what dates it under. */
    function amount(label, value, { sub = '', tone = '' } = {}) {
        return `<div class="frp-amount"><small>${label}</small><b class="${tone}">${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    }

    /** A fact the bank returned, for a row of facts or a ledger; nothing when it returned none. */
    const fact = (label, value, options = {}) => (value && value !== '—' ? { label, value, ...options } : null);

    /** The facts under a product's name: a row of label and value, all one size. */
    function factsHtml(facts) {
        const list = facts.filter(Boolean);
        if (!list.length) return '';
        return `<dl class="frp-facts">${list.map(item => `<div class="${item.wide ? 'is-wide' : ''}"><dt>${item.label}</dt><dd class="${item.tone || ''}"><span>${item.value}</span>${item.sub ? `<small>${item.sub}</small>` : ''}</dd></div>`).join('')}</dl>`;
    }

    /** A statement: label left, value flush right, the headline line first and larger; a meter may sit under it. */
    function ledger(rows) {
        const list = rows.filter(Boolean);
        if (!list.length) return '';
        return `<dl class="frp-ledger">${list.map(item => (item.meter
            ? `<div class="frp-ledger-meter">${item.meter}</div>`
            : `<div class="${item.main ? 'is-main' : ''}"><dt>${item.label}</dt><dd class="${item.tone || ''}"><span>${item.value}</span>${item.sub ? `<small>${item.sub}</small>` : ''}</dd></div>`)).join('')}</dl>`;
    }

    /** A share as people read it: «40,5 %», and «<0,1 %» for some, but too little to round. */
    function share(part) {
        if (part > 0 && part < 0.001) return '&lt;0,1 %';
        return `${formatter('s', () => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })).format(part * 100)} %`;
    }

    /** A bar and its legend: how far along a product is, from two figures its bank gave. */
    function meter(part, { left, right = '', tone = '' }) {
        const width = Math.max(0, Math.min(1, part)) * 100;
        return `
            <div class="frp-meter ${tone} ${part > 0 ? '' : 'is-zero'}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width.toFixed(1)}">
                <div class="frp-meter-bar"><span style="width:${width.toFixed(2)}%"></span></div>
                <div class="frp-meter-legend"><span>${left}</span>${right ? `<span>${right}</span>` : ''}</div>
            </div>`;
    }

    /** How much of a loan is repaid — only when the bank gave both what it lent and what is left. */
    function repaid(p) {
        if (!has(p.initial_balance) || !has(p.outstanding_balance)) return null;
        const lent = Math.abs(Number(p.initial_balance.amount));
        const left = Math.abs(Number(p.outstanding_balance.amount));
        return lent && left <= lent * 1.0001 ? { part: 1 - left / lent, left } : null;
    }

    /** How much of a credit card's limit is in use — only when the bank gave both the limit and what is drawn. */
    function inUse(p) {
        if (!has(p.limit) || !has(p.disposed)) return null;
        const limit = Math.abs(Number(p.limit.amount));
        if (!limit) return null;
        const part = Math.abs(Number(p.disposed.amount)) / limit;
        return { part, tone: part >= 0.9 ? 'is-high' : part >= 0.7 ? 'is-mid' : '' };
    }

    /** A line of small things beside a name: a number, what the bank calls the product. */
    const subLine = (...parts) => parts.filter(Boolean).map(part => `<span>${part}</span>`).join('<i class="frp-dot"></i>');

    const go = (label) => `<span class="frp-card-go">${label} <i class="fa-solid fa-chevron-right"></i></span>`;

    /**
     * One product, one card: its name and number on the left, the figure the family is read by on
     * the right, and the rest of what the bank said in a row of facts underneath.
     */
    function productCard({ open = '', title, tags = '', sub = '', main = '', gauge = '', facts = [], below = '', foot = '', after = '' }) {
        return `
            <article class="frp-card ${open ? 'is-link' : ''}" ${open ? `onclick="${open}"` : ''}>
                <header class="frp-card-head">
                    <div class="frp-card-id">
                        <div class="frp-card-title"><h3 title="${esc(title)}">${esc(title)}</h3>${tags}</div>
                        ${sub ? `<div class="frp-card-sub">${sub}</div>` : ''}
                    </div>
                    ${main}
                </header>
                ${gauge}
                ${factsHtml(facts)}
                ${below}
                ${foot ? `<footer class="frp-card-foot">${foot}</footer>` : ''}
                ${after}
            </article>`;
    }

    // ---------------------------------------------------------------- the global position

    /** One line of a family's list: the product, its bank and the figure that bank returned for it. */
    function row(familyKey, p) {
        const head = headline(familyKey, p);
        const debit = familyKey === 'direct_debits';
        const title = debit ? tidy(p.beneficiary?.name || 'Direct debit') : nameOf(p, 'Product');
        const number = debit ? tail(p.account) : ['loans', 'deposits'].includes(familyKey) ? (p.identifier?.value || p.contract?.value || '') : grouped(p.identifier);
        const open = familyKey === 'accounts' ? `FRP.showAccount('${esc(p.id)}')` : familyKey === 'cards' ? `FRP.showCard('${esc(p.id)}')` : `switchDashboardView('${familyKey}')`;
        return `
            <button type="button" class="frp-row" onclick="${open}">
                <span class="frp-row-main">
                    <b title="${esc(title)}">${esc(title)}</b>
                    <small>${bankLine(p)}${number ? `<i class="frp-dot"></i><span class="frp-mono">${esc(number)}</span>` : ''}</small>
                </span>
                ${head ? `<span class="frp-row-figure"><b class="${signOf(head.value) === 'is-negative' && head.label === 'Available' ? 'is-negative' : ''}">${money(head.value)}</b><small>${head.label}</small></span>` : ''}
                <i class="fa-solid fa-chevron-right frp-row-go"></i>
            </button>`;
    }

    /** A portfolio in the position: the securities account (or the holdings outside one), and what it holds. */
    function folioRow(folio) {
        const account = folio.account;
        const anchor = account || folio.holdings[0]?.product || {};
        const number = account ? account.identifier?.value : folio.named?.value;
        return `
            <button type="button" class="frp-row" onclick="switchDashboardView('investments')">
                <span class="frp-row-main">
                    <b title="${esc(folioTitle(folio))}">${esc(folioTitle(folio))}</b>
                    <small>${bankLine(anchor, folio.bank)}${number ? `<i class="frp-dot"></i><span class="frp-mono">${esc(number)}</span>` : ''}</small>
                    <span class="frp-comps">${composition(folio)}</span>
                </span>
                ${account && has(account.valuation) ? `<span class="frp-row-figure"><b>${money(account.valuation)}</b><small>Valuation</small></span>` : ''}
                <i class="fa-solid fa-chevron-right frp-row-go"></i>
            </button>`;
    }

    function renderOverview() {
        const person = profile();
        const banks = [...FR_RESULTS.banks.values()];
        const all = allProducts(data());
        const counts = (items) => FAMILIES.map(family => {
            if (family.key === 'investments') return investmentCount(items.filter(entry => entry.family.startsWith('investments.')));
            const n = items.filter(entry => entry.family === family.key).length;
            return n ? `<span class="frp-count"><i class="${family.icon}"></i>${plural(n, family.one, family.many)}</span>` : '';
        }).join('');
        const bankCards = banks.map(bank => {
            const items = all.filter(({ product }) => bankOfProduct(FR_RESULTS.banks, product)?.key === bank.key);
            const on = FR_RESULTS.filter === bank.key;
            return `
                <article class="frp-bank ${on ? 'is-on' : ''}">
                    <div class="frp-bank-head">
                        ${bankLogo(bank, 'lg')}
                        <div class="min-w-0">
                            <b>${esc(bank.name)}</b>
                            <small><img src="${flagUrl(bank.country)}" alt=""> Entity ${esc(String(bank.entity).padStart(4, '0'))}</small>
                        </div>
                    </div>
                    <div class="frp-bank-counts">${counts(items) || '<span class="frp-muted">Nothing read from this bank.</span>'}</div>
                    <button type="button" class="frp-bank-action" onclick="setBankFilter('${on ? 'all' : bank.key}')">${on ? '<i class="fa-solid fa-xmark"></i> Show every bank' : '<i class="fa-solid fa-filter"></i> Only this bank'}</button>
                </article>`;
        }).join('');
        const unmatched = all.filter(({ product }) => isUnmatched(product));
        const orphan = unmatched.length ? `
            <article class="frp-bank is-unknown ${FR_RESULTS.filter === 'unmatched' ? 'is-on' : ''}">
                <div class="frp-bank-head">${bankLogo(null, 'lg')}<div class="min-w-0"><b>Not matched</b><small>No connection of this session reads their entity</small></div></div>
                <div class="frp-bank-counts">${counts(unmatched)}</div>
                <button type="button" class="frp-bank-action" onclick="setBankFilter('${FR_RESULTS.filter === 'unmatched' ? 'all' : 'unmatched'}')">${FR_RESULTS.filter === 'unmatched' ? '<i class="fa-solid fa-xmark"></i> Show every bank' : '<i class="fa-solid fa-filter"></i> Only these'}</button>
            </article>` : '';
        const sections = FAMILIES.filter(requested).map(family => {
            const lines = family.key === 'investments'
                ? portfolios().map(folioRow)
                : productsOf(family.key).map(item => row(family.key, item.product));
            if (!lines.length) return '';
            return `
                <section class="frp-section">
                    <div class="frp-section-head">
                        <span class="frp-section-label"><i class="${family.icon}"></i> ${family.title}<em>${lines.length}</em></span>
                        <button type="button" class="frp-link" onclick="switchDashboardView('${family.key}')">See all <i class="fa-solid fa-chevron-right"></i></button>
                    </div>
                    <div class="frp-list">${lines.join('')}</div>
                </section>`;
        }).join('');
        return `
            <div class="frp-page">
                <header class="frp-head">
                    <div class="min-w-0">
                        <span class="frp-eyebrow">Global position</span>
                        <h2 class="frp-title">${person ? `Hello, ${esc(titleCase(person.name))}` : 'Global position'}</h2>
                        <p class="frp-sub">${plural(banks.length, 'bank', 'banks')} connected in this session, and what each of them holds.</p>
                    </div>
                </header>
                <section class="frp-section">
                    <div class="frp-section-head"><span class="frp-section-label"><i class="fa-solid fa-building-columns"></i> Connected banks<em>${banks.length}</em></span></div>
                    <div class="frp-banks">${bankCards + orphan || '<p class="frp-muted">No connection recorded for this session.</p>'}</div>
                </section>
                ${sections || emptyState('fa-solid fa-box-open', 'Nothing to show', FR_RESULTS.filter === 'all' ? 'The banks returned no product.' : 'This bank returned no product.')}
            </div>`;
    }

    // ---------------------------------------------------------------- a family, bank by bank

    const cardOf = {
        accounts: (p) => {
            const head = headline('accounts', p);
            const holders = (p.holders || []).map(holder => titleCase(holder.name)).filter(Boolean);
            return productCard({
                open: `FRP.showAccount('${esc(p.id)}')`,
                title: nameOf(p, 'Account'),
                tags: kindTag(p.sub_family),
                sub: subLine(`<span class="frp-mono">${esc(grouped(p.identifier))}</span>`, esc(describe(p))),
                main: head ? amount(head.label, money(head.value), { tone: signOf(head.value) === 'is-negative' ? 'is-negative' : '' }) : '',
                facts: [
                    head?.label !== 'Booked' ? fact('Booked', money(p.booked)) : null,
                    fact('Opened', p.opening_date ? day(p.opening_date) : ''),
                    fact(holders.length > 1 ? 'Holders' : 'Holder', `<span title="${esc(holders.join(', '))}">${esc(holders.join(', '))}</span>`),
                    fact('Movements', String((p.transactions || []).length)),
                ],
                foot: go('See movements'),
            });
        },
        cards: (p) => {
            const head = headline('cards', p);
            const use = inUse(p);
            const told = use && head?.label !== 'Available' && has(p.available);
            return productCard({
                open: `FRP.showCard('${esc(p.id)}')`,
                title: nameOf(p, 'Card'),
                tags: kindTag(p.sub_family) + statusTag(p.status),
                sub: subLine(`<span class="frp-mono">${esc(grouped(p.identifier))}</span>`, esc(titleCase(p.identifier?.brand)), esc(describe(p))),
                main: head ? amount(head.label, money(head.value)) : '',
                gauge: use ? meter(use.part, { left: `<b>${share(use.part)}</b> of the limit in use`, right: told ? `${money(p.available)} available` : '', tone: use.tone }) : '',
                facts: [
                    head?.label !== 'Available' && has(p.available) && !told ? fact('Available', money(p.available)) : null,
                    fact('Limit', has(p.limit) ? money(p.limit) : ''),
                    fact('Next payment', has(p.payment_amount) ? money(p.payment_amount) : '', { sub: p.next_payment_date ? day(p.next_payment_date) : '' }),
                    fact('Expires', expiry(p.expiration_date)),
                    accountFact('Linked account', p.linked_account),
                ],
                foot: go('See movements'),
            });
        },
        deposits: (p) => {
            const head = headline('deposits', p);
            return productCard({
                title: nameOf(p, 'Deposit'),
                tags: kindTag(p.sub_family),
                sub: subLine(p.contract?.value ? `<span class="frp-mono">${esc(p.contract.value)}</span>` : '', esc(describe(p))),
                main: head ? amount(head.label, money(head.value)) : '',
                facts: [
                    head?.label !== 'Available' && has(p.available) ? fact('Available', money(p.available)) : null,
                    fact('Goal', has(p.goal_amount) ? money(p.goal_amount) : ''),
                    fact('Interest', pct(p.interest_rate), { sub: esc(p.interest_rate?.description || '') }),
                    fact('Term', term(p.start_date, p.last_date), { sub: p.start_date ? `From ${day(p.start_date)}` : '' }),
                    accountFact('Account', p.account),
                ],
            });
        },
        loans: (p) => {
            const periods = p.total_periods ? `${p.current_period ?? '—'} of ${p.total_periods}` : '';
            const paid = repaid(p);
            return productCard({
                title: nameOf(p, 'Loan'),
                tags: kindTag(p.sub_family),
                sub: subLine(p.identifier?.value ? `<span class="frp-mono">${esc(p.identifier.value)}</span>` : '', esc(describe(p))),
                main: has(p.outstanding_balance) ? amount('Outstanding', money(p.outstanding_balance)) : '',
                gauge: paid ? meter(paid.part, { left: `<b>${share(paid.part)}</b> repaid`, right: `${money({ ...p.outstanding_balance, amount: paid.left })} left of ${money(p.initial_balance)}` }) : '',
                facts: [
                    paid ? null : fact('Initial amount', has(p.initial_balance) ? money(p.initial_balance) : ''),
                    fact('Next payment', has(p.next_payment_amount) ? money(p.next_payment_amount) : '', { sub: p.next_payment_date ? day(p.next_payment_date) : '' }),
                    fact('Interest', pct(p.interest_rate), { sub: esc(p.interest_rate?.description || '') }),
                    fact('Term', term(p.begin_date, p.end_date), { sub: p.renovation_date ? `Renewal ${day(p.renovation_date)}` : p.end_date ? `Ends ${day(p.end_date)}` : '' }),
                    fact('Instalments', periods, { sub: p.pending_periods !== undefined && p.pending_periods !== null ? `${plural(Number(p.pending_periods), 'instalment', 'instalments')} left` : '' }),
                    accountFact('Account', p.linked_account),
                ],
            });
        },
        direct_debits: (p) => {
            const charges = chargesOf(p);
            const last = charges[0];
            const receipt = (p.attachments || []).find(file => file && file.id);
            const beneficiary = p.beneficiary || {};
            return productCard({
                title: tidy(beneficiary.name || 'Direct debit'),
                tags: statusTag(p.status),
                sub: subLine(beneficiary.identifier ? `<span title="The creditor's SEPA identifier">Creditor <span class="frp-mono">${esc(beneficiary.identifier)}</span></span>` : '', beneficiary.tax_id ? `Tax ID <span class="frp-mono">${esc(beneficiary.tax_id)}</span>` : '', esc([kindOf(p.sub_family).toUpperCase(), titleCase(p.customer_segment)].filter(Boolean).join(' · '))),
                main: last && has(last.amount) ? amount('Last charge', money(last.amount), { sub: day(last.payment_date || last.issue_date) }) : '',
                facts: [
                    fact('Mandate', p.debit_reference ? `<span class="frp-mono" title="${esc(p.debit_reference)}">${esc(p.debit_reference)}</span>` : '', { wide: true }),
                    accountFact('Charged to', p.account),
                    fact('Payer', p.payer?.name ? `<span title="${esc(titleCase(p.payer.name))}">${esc(titleCase(p.payer.name))}</span>` : '', { sub: esc(p.payer?.identifier || '') }),
                    fact('Collects into', beneficiary.account ? `<span class="frp-mono">${esc(tail(beneficiary.account))}</span>` : ''),
                ],
                below: last?.concept ? `<p class="frp-concept" title="${esc(last.concept)}"><span>Concept</span>${esc(last.concept)}</p>` : '',
                foot: `
                    <button type="button" class="frp-toggle" aria-expanded="false" ${charges.length ? 'onclick="FRP.toggleCharges(this)"' : 'disabled'}><i class="fa-solid fa-chevron-right"></i>${charges.length ? `${plural(charges.length, 'charge', 'charges')} read` : 'No charge read'}</button>
                    ${receipt ? `<button type="button" class="frp-receipt" title="Open ${esc(receipt.content_name || 'the receipt')}" onclick="FRP.openReceipt(this, '${esc(receipt.id)}')"><i class="fa-solid fa-file-pdf"></i><span>Last receipt</span><i class="fa-solid fa-up-right-from-square"></i></button>` : ''}`,
                after: charges.length ? `<div class="frp-charges">${chargesTable(charges, receipt)}</div>` : '',
            });
        },
    };

    /** A direct debit's charges, newest first. */
    const chargesOf = (p) => [...(p.transactions || [])].sort((a, b) => String(b.payment_date || b.issue_date || '').localeCompare(String(a.payment_date || a.issue_date || '')));
    const lastCharge = (p) => chargesOf(p)[0] || null;

    /** The charges a direct debit produced; the newest carries the receipt the bank gave for it. */
    function chargesTable(charges, receipt) {
        const rows = charges.map((charge, index) => {
            const paid = charge.payment_date || charge.issue_date;
            const issued = charge.issue_date && charge.payment_date && day(charge.issue_date) !== day(charge.payment_date) ? `<small>Issued ${day(charge.issue_date)}</small>` : '';
            const clip = index === 0 && receipt ? `<button type="button" class="frp-clip" title="Open the receipt: ${esc(receipt.content_name || '')}" onclick="FRP.openReceipt(this, '${esc(receipt.id)}')"><i class="fa-solid fa-paperclip"></i></button>` : '';
            return `
                <tr>
                    <td class="frp-tx-date"><b>${day(paid)}</b>${issued}</td>
                    <td class="frp-charge-concept">${esc(charge.concept || '—')}</td>
                    <td class="frp-tx-kind">${charge.status ? `<span class="frp-cat ${TONES[charge.status] || ''}">${esc(kindOf(charge.status))}</span>` : ''}</td>
                    <td class="frp-tx-amount"><b>${money(charge.amount)}</b>${clip}</td>
                </tr>`;
        }).join('');
        return `<table class="frp-table"><thead><tr><th>Paid</th><th>Concept</th><th class="frp-tx-kind">Status</th><th class="text-right">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    /** A bank's heading inside a family: its logo, its name and how much of the family it holds. */
    function groupHead(bank, count) {
        return `<div class="frp-group">${bankLogo(bank, 'sm')}<b>${bank ? esc(bank.name) : 'Not matched'}</b><small>${count}</small><span class="frp-group-rule"></span></div>`;
    }

    function familyHead(family) {
        return `
            <header class="frp-head">
                <span class="frp-head-icon"><i class="${family.icon}"></i></span>
                <div class="min-w-0">
                    <h2 class="frp-title">${family.title}</h2>
                    <p class="frp-sub">${family.blurb}</p>
                </div>
            </header>`;
    }

    function renderFamily(familyKey) {
        const family = FAMILIES.find(f => f.key === familyKey);
        const head = familyHead(family);
        if (!requested(family)) {
            return `<div class="frp-page">${head}${emptyState('fa-solid fa-lock', 'Not requested', 'The session was not created to read this family, so no bank was asked for it.')}</div>`;
        }
        if (familyKey === 'investments') return renderInvestments(head);
        const items = productsOf(familyKey);
        if (!items.length) {
            return `<div class="frp-page">${head}${emptyState(family.icon, `No ${family.many}`, FR_RESULTS.filter === 'all' ? `The banks returned no ${family.one}.` : `This bank returned no ${family.one}.`)}</div>`;
        }
        const groups = byBank(items).map(group => `
            <section class="frp-bank-group">
                ${groupHead(group.bank, plural(group.items.length, family.one, family.many))}
                <div class="frp-cards">${group.items.map(item => cardOf[familyKey](item.product)).join('')}</div>
            </section>`).join('');
        return `<div class="frp-page">${head}${groups}</div>`;
    }

    // ---------------------------------------------------------------- investments: each account and what it holds

    function renderInvestments(head) {
        const folios = portfolios();
        if (!folios.length) {
            return `<div class="frp-page">${head}${emptyState('fa-solid fa-chart-line', 'No investments', FR_RESULTS.filter === 'all' ? 'The banks returned no securities account and no holding.' : 'This bank returned no securities account and no holding.')}</div>`;
        }
        const groups = byBank(folios, folio => folio.bank).map(group => {
            const accounts = group.items.filter(folio => folio.account).length;
            const loose = group.items.filter(folio => !folio.account).reduce((n, folio) => n + folio.holdings.length, 0);
            const count = [accounts ? plural(accounts, 'securities account', 'securities accounts') : '', loose ? plural(loose, accounts ? 'other holding' : 'holding', accounts ? 'other holdings' : 'holdings') : ''].filter(Boolean).join(' · ');
            return `
                <section class="frp-bank-group">
                    ${groupHead(group.bank, count)}
                    <div class="frp-cards">${group.items.map(folioCard).join('')}</div>
                </section>`;
        }).join('');
        return `<div class="frp-page">${head}${groups}</div>`;
    }

    /** A securities account (or the holdings outside one): its own figures, then a table of what it holds. */
    function folioCard(folio) {
        const a = folio.account;
        const sub = a
            ? subLine(a.identifier?.value ? `<span class="frp-mono">${esc(a.identifier.value)}</span>` : '', esc(describe(a)), a.valuation_date ? `Valued ${day(a.valuation_date)}` : '')
            : `<span>${folio.named ? 'The bank returned what this account holds, not the account itself.' : 'Holdings the bank returned without a securities account to hold them.'}</span>`;
        return `
            <article class="frp-card frp-folio ${a ? '' : 'is-loose'}">
                <header class="frp-card-head">
                    <span class="frp-folio-icon"><i class="fa-solid ${a ? 'fa-briefcase' : 'fa-layer-group'}"></i></span>
                    <div class="frp-card-id">
                        <div class="frp-card-title"><h3 title="${esc(folioTitle(folio))}">${esc(folioTitle(folio))}</h3>${a ? '' : '<span class="frp-tag is-quiet">No account returned</span>'}</div>
                        <div class="frp-card-sub">${sub}</div>
                    </div>
                    ${a && has(a.valuation) ? amount('Valuation', money(a.valuation)) : ''}
                </header>
                ${a ? factsHtml([
                    fact('Gain', has(a.appreciation) ? money(a.appreciation, { sign: true }) : '', { tone: signOf(a.appreciation) }),
                    fact('Return', pct(a.performance, { sign: true }), { tone: signOfRate(a.performance), sub: esc(a.performance?.description || '') }),
                    fact('Holdings', folio.holdings.length ? String(folio.holdings.length) : ''),
                    fact('Segment', esc(titleCase(a.customer_segment))),
                ]) : ''}
                ${holdingsTable(folio)}
            </article>`;
    }

    /** What a portfolio holds, kind after kind, each kind headed by how many there are and what they add up to. */
    function holdingsTable(folio) {
        if (!folio.holdings.length) return '<p class="frp-folio-empty"><i class="fa-regular fa-folder-open"></i>The bank returned no holding in this account.</p>';
        const valuedOn = folio.account?.valuation_date;
        const body = HOLDING_KINDS.map(kind => {
            const own = folio.holdings.filter(holding => holding.kind === kind.key).map(holding => holding.product);
            if (!own.length) return '';
            const total = sumOf(own);
            return `
                <tr class="frp-kind-row">
                    <td><span class="frp-kind"><i class="${kind.icon}"></i>${kind.title}<em>${own.length}</em></span></td>
                    <td class="is-wide"></td><td class="is-wide"></td>
                    <td class="is-num">${total.text ? `<b title="${esc(total.note)}">${total.text}</b>` : ''}</td>
                    <td></td>
                </tr>
                ${own.map(product => holdingRow(product, valuedOn)).join('')}`;
        }).join('');
        return `
            <div class="frp-holdings">
                <table>
                    <colgroup><col><col class="is-wide frp-col-qty"><col class="is-wide frp-col-price"><col class="frp-col-value"><col class="frp-col-gain"></colgroup>
                    <thead><tr><th>Holding</th><th class="is-num is-wide">Quantity</th><th class="is-num is-wide">Price</th><th class="is-num">Valuation</th><th class="is-num">Gain</th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>`;
    }

    function holdingRow(p, valuedOn) {
        const name = nameOf(p, 'Holding');
        const codes = [p.isin, p.ticker, p.market ? titleCase(p.market) : '', p.category ? tidy(p.category) : '', p.identifier?.value || p.contract?.value || ''].filter(Boolean);
        const units = qty(p.quantity);
        const price = has(p.unit_price) ? money(p.unit_price, { decimals: 6 }) : '';
        const contributed = has(p.total_contribution) ? `Contributed ${money(p.total_contribution)}${has(p.year_to_date_contribution) ? ` · ${money(p.year_to_date_contribution)} this year` : ''}` : '';
        const yearly = pct(p.performance_year_to_date, { sign: true });
        return `
            <tr>
                <td class="frp-h-name">
                    <b title="${esc(name)}">${esc(name)}</b>
                    ${codes.length ? `<small>${codes.map(esc).join(' · ')}</small>` : ''}
                    ${contributed ? `<small>${contributed}</small>` : ''}
                    ${units ? `<small class="frp-h-units">${units}${price ? ` × ${price}` : ''}</small>` : ''}
                </td>
                <td class="is-num is-wide"><b class="is-plain">${units || '—'}</b></td>
                <td class="is-num is-wide"><b class="is-plain">${price || '—'}</b></td>
                <td class="is-num"><b>${money(p.valuation)}</b>${p.valuation_date && p.valuation_date !== valuedOn ? `<small>${day(p.valuation_date)}</small>` : ''}</td>
                <td class="is-num"><b class="${signOf(p.appreciation)}">${has(p.appreciation) ? money(p.appreciation, { sign: true }) : '—'}</b>${pct(p.performance) ? `<small class="${signOfRate(p.performance)}">${pct(p.performance, { sign: true })}</small>` : ''}${yearly ? `<small class="${signOfRate(p.performance_year_to_date)}">${yearly} this year</small>` : ''}</td>
            </tr>`;
    }

    function emptyState(icon, title, text) {
        return `<div class="frp-empty"><span><i class="${icon}"></i></span><b>${title}</b><p>${text}</p></div>`;
    }

    // ---------------------------------------------------------------- an account's or a card's own page

    function crumbs(familyKey, title) {
        const family = FAMILIES.find(f => f.key === familyKey);
        return `<nav class="frp-crumbs"><button type="button" onclick="switchDashboardView('${familyKey}')"><i class="fa-solid fa-chevron-left"></i>${family.title}</button><span>/</span><b>${esc(title)}</b></nav>`;
    }

    /** Who a movement went to or came from, when the bank named them and the descriptions do not. */
    function counterpart(tx) {
        const said = (tx.descriptions || []).join(' ').toLowerCase();
        const fresh = (name) => name && !said.includes(String(name).toLowerCase());
        const income = Number(tx.amount?.amount) > 0;
        if (tx.merchant?.name && fresh(tx.merchant.name)) return `${titleCase(tx.merchant.name)}${tx.merchant.country_code ? ` · ${tx.merchant.country_code}` : ''}`;
        if (income && fresh(tx.payer?.name)) return `From ${titleCase(tx.payer.name)}`;
        if (!income && fresh(tx.payee?.name)) return `To ${titleCase(tx.payee.name)}`;
        return '';
    }

    // ---------------------------------------------------------------- finding a movement

    /** Text the way the search compares it: no accents, no case, one space between words. */
    const fold = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

    /** Every text and number inside a value, a few levels deep: all a payee or a merchant says about itself. */
    function leaves(value, depth = 3) {
        if (value === null || value === undefined) return [];
        if (typeof value === 'string' || typeof value === 'number') return [String(value)];
        if (depth <= 0 || typeof value !== 'object') return [];
        return (Array.isArray(value) ? value : Object.values(value)).flatMap(item => leaves(item, depth - 1));
    }

    /** An amount in every way someone may type it: -137.04, 137,04, 1033.55, 1.033,55. */
    function spellings(value) {
        if (!has(value)) return [];
        const plain = Math.abs(Number(value.amount)).toFixed(2);
        return [String(value.amount), plain, plain.replace('.', ','), money({ ...value, amount: plain })];
    }

    /**
     * What a movement can be found by: its descriptions, the bank's id and reference, its category,
     * whoever paid and was paid (all they say, shown in the table or not), the merchant, the amount
     * in every spelling and the dates. A movement of a shape this does not expect is found by its
     * descriptions alone, and one with none by nothing — the search never breaks the table.
     */
    function findable(tx) {
        try {
            return fold([
                ...leaves(tx.descriptions), tx.provider_id, tx.reference, tx.type, tx.status,
                String(tx.category || '').replace(/::/g, ' '),
                ...leaves(tx.payee), ...leaves(tx.payer), ...leaves(tx.merchant),
                ...spellings(tx.amount),
                tx.operation_date, tx.value_date, tx.operation_date ? day(tx.operation_date) : '', tx.value_date ? day(tx.value_date) : '',
            ].filter(part => part !== null && part !== undefined && part !== '').join(' '));
        } catch {
            try {
                return fold(leaves(tx?.descriptions).join(' '));
            } catch {
                return '';
            }
        }
    }

    /** A search split into what must all be found: its words, or "a phrase" in quotes. */
    function termsOf(query) {
        const terms = [];
        String(query || '').replace(/"([^"]*)"|(\S+)/g, (_, phrase, word) => {
            const term = fold(phrase ?? word.replace(/"/g, ''));
            if (term) terms.push(term);
            return '';
        });
        return terms;
    }

    /** The movements on screen, each as the search reads it, in the table's order. */
    let findables = [];

    /** Leaves in the table the movements that hold every term; with no term, or on any failure, all of them. */
    function searchMovements(input) {
        const table = document.getElementById('frpTx');
        if (!table) return;
        const rows = [...table.querySelectorAll('tbody tr[data-i]')];
        let terms = [];
        try { terms = termsOf(input.value); } catch { terms = []; }
        let shown = 0;
        rows.forEach(row => {
            let hit = true;
            try { hit = !terms.length || terms.every(term => (findables[Number(row.dataset.i)] || '').includes(term)); } catch { hit = true; }
            row.hidden = !hit;
            if (hit) shown += 1;
        });
        const none = table.querySelector('.frp-tx-none');
        if (none) none.hidden = shown > 0;
        const count = document.getElementById('frpTxCount');
        if (count) count.textContent = terms.length ? `${shown} of ${rows.length}` : String(rows.length);
        input.closest('.frp-search')?.classList.toggle('is-filled', !!input.value);
    }

    function clearSearch(button) {
        const input = button.closest('.frp-search')?.querySelector('input');
        if (!input) return;
        input.value = '';
        searchMovements(input);
        input.focus();
    }

    /** The movements' heading: how many there are, and a box to find one by anything the bank said about it. */
    function movementsHead(list) {
        return `
            <div class="frp-section-head is-search">
                <span class="frp-section-label"><i class="fa-solid fa-list-ul"></i> Movements<em id="frpTxCount">${list.length}</em></span>
                ${list.length ? `
                <label class="frp-search" title="Descriptions, payer, payee, merchant, amount, date or the bank's id — every word must match; quotes keep a phrase together">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="search" placeholder="Search movements" autocomplete="off" spellcheck="false" aria-label="Search the movements" oninput="FRP.searchMovements(this)" onkeydown="if (event.key === 'Escape') { this.value = ''; FRP.searchMovements(this); }">
                    <button type="button" class="frp-search-clear" onclick="FRP.clearSearch(this)" title="Clear the search"><i class="fa-solid fa-xmark"></i></button>
                </label>` : ''}
            </div>`;
    }

    function movements(list) {
        findables = list.map(findable);
        if (!list.length) return emptyState('fa-solid fa-list-ul', 'No movements', 'The bank returned no movement for this product in the window the session asked for.');
        const rows = list.map((tx, index) => {
            const amountValue = Number(tx.amount?.amount);
            const kind = tx.category ? tx.category.split('::').pop().replace(/_/g, ' ') : '';
            const direction = tx.category?.startsWith('income::') ? 'is-in' : tx.category?.startsWith('expenses::') ? 'is-out' : '';
            const [first, second] = tx.descriptions || [];
            const who = counterpart(tx);
            return `
                <tr data-i="${index}">
                    <td class="frp-tx-date"><b>${day(tx.operation_date || tx.value_date)}</b>${tx.operation_date && tx.value_date && tx.value_date !== tx.operation_date ? `<small>Value ${day(tx.value_date)}</small>` : ''}</td>
                    <td class="frp-tx-what"><b title="${esc(first || '')}">${esc(first || '—')}</b>${second ? `<small title="${esc(second)}">${esc(second)}</small>` : ''}${who ? `<small class="frp-tx-who" title="${esc(who)}">${esc(who)}</small>` : ''}<small class="frp-tx-when">${day(tx.operation_date || tx.value_date)}</small></td>
                    <td class="frp-tx-kind">${kind ? `<span class="frp-cat ${direction}">${esc(kind)}</span>` : ''}</td>
                    <td class="frp-tx-amount"><b class="${amountValue > 0 ? 'is-positive' : ''}">${money(tx.amount, { sign: true })}</b>${has(tx.balance) ? `<small>${money(tx.balance)}</small>` : ''}</td>
                </tr>`;
        }).join('');
        const none = '<tr class="frp-tx-none" hidden><td colspan="4"><i class="fa-solid fa-magnifying-glass"></i>No movement matches the search.</td></tr>';
        return `<div class="frp-table-card"><table class="frp-table" id="frpTx"><thead><tr><th class="frp-tx-date">Date</th><th>Description</th><th class="frp-tx-kind">Category</th><th class="text-right">Amount</th></tr></thead><tbody>${rows}${none}</tbody></table></div>`;
    }

    function find(familyKey, id) {
        return (data()[familyKey] || []).find(product => String(product.id) === String(id));
    }

    function renderAccount(id) {
        const p = find('accounts', id);
        if (!p) return renderFamily('accounts');
        const holders = (p.holders || []).map(holder => `
            <div class="frp-holder"><span class="frp-avatar sm">${esc(initials({ name: holder.name, name_extra: String(holder.name || '').split(' ')[1] }))}</span><div><b>${esc(titleCase(holder.name))}</b><small>${esc(titleCase(holder.role || 'holder'))}${holder.identifier?.value ? ` · ${esc(holder.identifier.value)}` : ''}</small></div></div>`).join('');
        const head = headline('accounts', p);
        return `
            <div class="frp-page">
                ${crumbs('accounts', nameOf(p, 'Account'))}
                <section class="frp-hero">
                    <div class="frp-hero-main">
                        <div class="frp-hero-bank">${bankLine(p)}<span class="frp-hero-tags">${kindTag(p.sub_family)}</span></div>
                        <h2 class="frp-hero-title">${esc(nameOf(p, 'Account'))}</h2>
                        ${describe(p) ? `<p class="frp-hero-desc">${esc(describe(p))}</p>` : ''}
                        <span class="frp-hero-number frp-mono">${esc(grouped(p.identifier, { full: true }) || '—')}</span>
                    </div>
                    ${ledger([
                        head ? fact(head.label, money(head.value), { main: true, tone: signOf(head.value) === 'is-negative' ? 'is-negative' : '' }) : null,
                        head?.label !== 'Booked' ? fact('Booked', money(p.booked)) : null,
                        fact('Opened', p.opening_date ? day(p.opening_date) : ''),
                        fact('Segment', esc(titleCase(p.customer_segment))),
                        fact('Read on', p.fetch_date ? day(p.fetch_date) : ''),
                    ])}
                </section>
                ${holders ? `<div class="frp-section-head"><span class="frp-section-label"><i class="fa-solid fa-user-group"></i> Holders<em>${p.holders.length}</em></span></div><div class="frp-holders">${holders}</div>` : ''}
                ${movementsHead(p.transactions || [])}
                ${movements(p.transactions || [])}
            </div>`;
    }

    // ---------------------------------------------------------------- a card's plastic, in its bank's colours

    /** A colour's relative luminance (WCAG), from `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
    function luminance(hex) {
        let digits = String(hex).replace('#', '');
        if (digits.length <= 4) digits = [...digits].map(char => char + char).join('');
        const [r, g, b] = [0, 2, 4]
            .map(at => parseInt(digits.slice(at, at + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    /**
     * A bank's colours as a plastic: a dark ground runs from its main colour to its dark one and
     * carries white; a light ground runs from its light colour to its main one and carries the ink the
     * bank declares. Without the bank's colours, the app's (the stylesheet's default).
     */
    function plasticLook(color) {
        if (!color) return { tone: 'is-dark', style: '' };
        const light = color.contrast ? luminance(color.contrast) < 0.5 : luminance(color.main) > 0.45;
        const [from, to] = light ? [color.light, color.main] : [color.main, color.dark];
        const ink = color.contrast || (light ? '#0f172a' : '#ffffff');
        return { tone: light ? 'is-light' : 'is-dark', style: `--plastic-from:${from};--plastic-to:${to};--plastic-ink:${ink};--plastic-glow:color-mix(in srgb, ${color.main} 38%, transparent)` };
    }

    function plastic(p) {
        const bank = bankOfProduct(FR_RESULTS.banks, p);
        const look = plasticLook(bank?.color);
        const brand = String(p.identifier?.brand || '').trim();
        const mark = /^master/i.test(brand)
            ? '<span class="frp-plastic-mc" title="Mastercard"><i></i><i></i></span>'
            : brand ? `<span class="frp-plastic-brand">${esc(/^american/i.test(brand) ? 'AMEX' : brand.toUpperCase())}</span>` : '';
        const logo = bank
            ? `<img class="frp-plastic-logo" src="${engineLogoUrl(bank.engines[0].code, 'rectangle')}" alt="${esc(bank.name)}" crossorigin="anonymous" onload="FRP.checkLogo(this)" onerror="FRP.logoFailed(this)">`
            : `<span class="frp-plastic-name">${esc(strangerName(p))}</span>`;
        return `
            <div class="frp-plastic ${look.tone}" ${look.style ? `style="${look.style}"` : ''}>
                <div class="frp-plastic-top">${logo}<span class="frp-plastic-kind">${esc(kindOf(p.sub_family))}</span></div>
                <div class="frp-plastic-chip"><span></span><i class="fa-solid fa-wifi"></i></div>
                <span class="frp-plastic-number">${esc(grouped(p.identifier) || '•••• •••• •••• ••••')}</span>
                <div class="frp-plastic-bottom">
                    <div class="min-w-0">
                        ${p.expiration_date ? `<span class="frp-plastic-exp"><small>Valid thru</small>${esc(expiry(p.expiration_date))}</span>` : ''}
                        <span class="frp-plastic-holder">${esc(holderName(p.holder_name))}</span>
                    </div>
                    ${mark}
                </div>
            </div>`;
    }

    /**
     * Whether a wide logo can become a silhouette in the plastic's ink: one drawn on its own ground,
     * or with white inside it, cannot — it would turn into a block — so it keeps its colours on a
     * white plate. A logo the browser may not read stays a silhouette.
     */
    function checkLogo(img) {
        try {
            const canvas = Object.assign(document.createElement('canvas'), { width: 48, height: 24 });
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(img, 0, 0, 48, 24);
            const pixels = context.getImageData(0, 0, 48, 24).data;
            const alpha = (x, y) => pixels[(y * 48 + x) * 4 + 3];
            let ink = 0;
            let white = 0;
            for (let at = 0; at < pixels.length; at += 4) {
                if (pixels[at + 3] < 128) continue;
                ink += 1;
                if (pixels[at] > 225 && pixels[at + 1] > 225 && pixels[at + 2] > 225) white += 1;
            }
            const grounded = [[0, 0], [47, 0], [0, 23], [47, 23]].every(([x, y]) => alpha(x, y) > 200);
            if (grounded || (ink && white / ink > 0.08)) img.classList.add('is-plate');
        } catch { /* nothing to read: it stays a silhouette */ }
    }

    /** A wide logo that did not load: the bank's name in its place. */
    function logoFailed(img) {
        img.replaceWith(Object.assign(document.createElement('span'), { className: 'frp-plastic-name', textContent: img.alt }));
    }

    function renderCard(id) {
        const p = find('cards', id);
        if (!p) return renderFamily('cards');
        const head = headline('cards', p);
        const use = inUse(p);
        const linked = accountFact('Linked account', p.linked_account);
        return `
            <div class="frp-page">
                ${crumbs('cards', nameOf(p, 'Card'))}
                <section class="frp-hero is-card">
                    <div class="frp-hero-plastic">
                        ${plastic(p)}
                        ${linked ? `<div class="frp-hero-aside"><span>${linked.label}</span><div>${linked.value}${linked.sub || ''}</div></div>` : ''}
                    </div>
                    <div class="frp-hero-main">
                        <div class="frp-hero-bank">${bankLine(p)}<span class="frp-hero-tags">${kindTag(p.sub_family)}${statusTag(p.status)}</span></div>
                        <h2 class="frp-hero-title">${esc(nameOf(p, 'Card'))}</h2>
                        ${describe(p) ? `<p class="frp-hero-desc">${esc(describe(p))}</p>` : ''}
                        ${ledger([
                            head ? fact(head.label, money(head.value), { main: true }) : null,
                            use ? { meter: meter(use.part, { left: `<b>${share(use.part)}</b> of the limit in use`, tone: use.tone }) } : null,
                            fact('Limit', has(p.limit) ? money(p.limit) : ''),
                            head?.label !== 'Available' && has(p.available) ? fact('Available', money(p.available)) : null,
                            fact('Next payment', has(p.payment_amount) ? money(p.payment_amount) : '', { sub: p.next_payment_date ? day(p.next_payment_date) : '' }),
                            fact('Billing period', p.billing_period_start ? `${day(p.billing_period_start)} – ${day(p.billing_period_end)}` : ''),
                            fact('Expires', p.expiration_date ? day(p.expiration_date) : ''),
                        ])}
                    </div>
                </section>
                ${movementsHead(p.transactions || [])}
                ${movements(p.transactions || [])}
            </div>`;
    }

    // ---------------------------------------------------------------- a direct debit's receipt and charges

    function toggleCharges(button) {
        const card = button.closest('.frp-card');
        const open = !card.classList.contains('is-open');
        card.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
    }

    const attachmentOf = (id) => (data().direct_debits || []).flatMap(p => p.attachments || []).find(file => String(file?.id) === String(id)) || null;

    /** The receipts already fetched: the API serves a document once every 5 seconds, so a second look is free. */
    const receipts = new Map();
    let onScreen = null;

    /**
     * Opens a receipt over the page in the browser's own PDF viewer, the way the Spain Public
     * Administration results show every document. The application secret travels in a header, which
     * no link can carry, so the file is fetched and shown from memory; «Save to disk» keeps its name.
     */
    async function openReceipt(button, id) {
        const file = attachmentOf(id);
        if (!file || button.classList.contains('is-busy')) return;
        const idle = { html: button.innerHTML, title: button.title };
        const iconOnly = button.classList.contains('frp-clip');
        const say = (icon, text) => `<i class="fa-solid ${icon}"></i>${iconOnly ? '' : `<span>${esc(text)}</span>`}`;
        button.classList.add('is-busy');
        button.innerHTML = say('fa-spinner fa-spin', 'Opening');
        try {
            if (!receipts.has(id)) {
                const blob = await window.InfoniteFlowsManager.downloadAttachment(configObj?.widgetUrl, configObj?.secret, currentSessionData?.session_id, id);
                // the viewer needs the type to draw the file instead of offering to save it
                receipts.set(id, blob.type === 'application/pdf' ? blob : new Blob([blob], { type: file.content_type || 'application/pdf' }));
            }
            showPdf(receipts.get(id), file.content_name || `${id}.pdf`);
            button.innerHTML = idle.html;
            button.classList.remove('is-busy');
        } catch (error) {
            button.classList.add('is-error');
            button.title = error.message;
            button.innerHTML = say('fa-triangle-exclamation', error.message);
            setTimeout(() => { button.innerHTML = idle.html; button.title = idle.title; button.classList.remove('is-busy', 'is-error'); }, 4000);
        }
    }

    function showPdf(blob, name) {
        let modal = document.getElementById('frpPdf');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'frpPdf';
            modal.className = 'frp-pdf';
            modal.innerHTML = `
                <div class="frp-pdf-panel" role="dialog" aria-modal="true" aria-label="Receipt">
                    <header class="frp-pdf-head">
                        <i class="fa-solid fa-file-pdf"></i>
                        <b id="frpPdfName"></b>
                        <button type="button" class="frp-pdf-save" onclick="FRP.saveReceipt()"><i class="fa-solid fa-download"></i><span>Save to disk</span></button>
                        <button type="button" class="frp-pdf-close" onclick="FRP.closeReceipt()" title="Close"><i class="fa-solid fa-xmark"></i></button>
                    </header>
                    <div class="frp-pdf-body"><iframe id="frpPdfFrame" title="Receipt" src="about:blank"></iframe></div>
                </div>`;
            modal.addEventListener('click', (event) => { if (event.target === modal) closeReceipt(); });
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && onScreen) closeReceipt(); });
            document.body.appendChild(modal);
        }
        closeReceipt();
        onScreen = { url: URL.createObjectURL(blob), name };
        document.getElementById('frpPdfName').textContent = name;
        document.getElementById('frpPdfFrame').src = onScreen.url;
        modal.classList.add('is-open');
        document.body.classList.add('overflow-hidden');
    }

    function closeReceipt() {
        const modal = document.getElementById('frpPdf');
        if (modal) modal.classList.remove('is-open');
        const frame = document.getElementById('frpPdfFrame');
        if (frame) frame.src = 'about:blank';
        if (onScreen) URL.revokeObjectURL(onScreen.url);
        onScreen = null;
        document.body.classList.remove('overflow-hidden');
    }

    /** The receipt on screen, saved under the name the bank gave it (the viewer's own button would name it after the blob). */
    function saveReceipt() {
        if (!onScreen) return;
        const link = Object.assign(document.createElement('a'), { href: onScreen.url, download: onScreen.name });
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    // ---------------------------------------------------------------- what the page calls

    /** Draws a view into the page's root; true when this module drew it. */
    function render(view, root) {
        if (view === 'overview') root.innerHTML = renderOverview();
        else if (FAMILIES.some(f => f.key === view)) root.innerHTML = renderFamily(view);
        else return false;
        renderIdentityBanner();
        return true;
    }

    function showDetail(familyKey, id, draw) {
        FR_RESULTS.view = familyKey;
        markNav(familyKey);
        const root = document.getElementById('dashboard-view-root');
        root.innerHTML = draw(id);
        renderIdentityBanner();
        root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    /** The rail's active entry; when the rail is a strip of tabs, the strip slides to show it. */
    function markNav(view) {
        document.querySelectorAll('.dashboard-nav-btn').forEach(btn => btn.classList.toggle('is-active', btn.id === `nav-${view}`));
        const rail = document.querySelector('.frp-rail');
        const active = document.getElementById(`nav-${view}`);
        if (rail && active && rail.scrollWidth > rail.clientWidth) {
            rail.scrollTo({ left: Math.max(0, active.offsetLeft - rail.clientWidth / 2 + active.offsetWidth / 2), behavior: 'smooth' });
        }
    }

    window.FRP = {
        render,
        renderBar,
        renderIdentityBanner,
        openProfile,
        closeProfile,
        markNav,
        showAccount: (id) => showDetail('accounts', id, renderAccount),
        showCard: (id) => showDetail('cards', id, renderCard),
        searchMovements,
        clearSearch,
        toggleCharges,
        openReceipt,
        closeReceipt,
        saveReceipt,
        checkLogo,
        logoFailed,
    };
})();
