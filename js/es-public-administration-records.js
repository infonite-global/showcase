/**
 * es-public-administration-records.js
 * A Spain Public Administration session's records, drawn the way every flow's results are: the view's
 * head on the page's own ground, then one card per record — never a card inside a card — built with
 * the results kit (js/results-kit.js). Social Security, the driver and their vehicles, the tax returns,
 * the Banco de España's credit registry, education and properties. The person's profile and the
 * session's own view (consent and audit) are the kit's.
 *
 * Every figure is one an administration returned; nothing here adds amounts up. It reads the results
 * page's state (window.currentResultData) and its helpers for documents (openAttachment,
 * getAttachmentMeta, driverPhotoAttachment, fetchDriverPhotoUrl). Styles:
 * css/es-public-administration-records.css over css/results-kit.css.
 */
(function () {
    'use strict';

    const R = window.InfoniteResults;
    const {
        esc, has, money, qty, share, day, plural, titleCase, listOf, isRecord, fact, facts, ledger, meter, amount,
        subLine, card, empty, safely, broken, head, sectionLabel, searchBox, searchNone, index, flagUrl, go,
    } = R;

    const results = () => window.currentResultData || {};
    const data = () => (isRecord(results().data) ? results().data : {});
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const today = () => new Date().toISOString().slice(0, 10);

    /** The views of the records: what each is called and what it is about. */
    const VIEWS = {
        work_life: { icon: 'fa-solid fa-briefcase', title: 'Social Security', sub: 'The days the Seguridad Social counts, the periods worked, the contribution bases and the state pensions.' },
        driver: { icon: 'fa-solid fa-car', title: 'Driver Data', sub: "The DGT's record of the person: their driving licence, its points, and the vehicles registered in their name." },
        taxes: { icon: 'fa-solid fa-file-invoice-dollar', title: 'Taxes', sub: 'The yearly personal income tax returns the Agencia Tributaria holds.' },
        credit_registry: { icon: 'fa-solid fa-money-check-dollar', title: 'Credit Registry (CIRBE)', sub: "The Banco de España's report: every risk its declaring entities report in the person's name." },
        academic: { icon: 'fa-solid fa-graduation-cap', title: 'Education & Training', sub: 'The official degrees and certificates on record.' },
        properties: { icon: 'fa-solid fa-house', title: 'Properties', sub: "The real estate the Catastro records in the person's name, with its assessed values." },
    };

    const viewHead = (view) => head(VIEWS[view].icon, esc(VIEWS[view].title), esc(VIEWS[view].sub));
    const page = (view, ...parts) => `<div class="rk-page">${viewHead(view)}${parts.join('')}</div>`;

    /** A section on the ground: its label, how many it holds, and what goes beside the label (a search box). */
    function section(icon, title, count, body, beside = '') {
        return `
            <section class="rk-section">
                <div class="rk-section-head${beside ? ' is-search' : ''}">${sectionLabel(icon, title, count)}${beside}</div>
                ${body}
            </section>`;
    }

    /** A tag: a short word beside a name. */
    const tag = (text, tone = '') => `<span class="rk-tag${tone ? ` ${tone}` : ''}">${text}</span>`;

    /** Handler code that hands a value to a function, safe inside an attribute whatever the value holds. */
    const call = (fn, value) => `${fn}(${esc(JSON.stringify(String(value)))})`;

    /** A count the source gave: a number, never an empty placeholder. */
    const countOf = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

    /**
     * Days as years, months and days, the way the Seguridad Social reads them (a year of 365 days, a
     * month of 30), so a total matches its report.
     */
    function humanDays(total) {
        if (total === null || total < 0) return '';
        const years = Math.floor(total / 365);
        const months = Math.floor((total % 365) / 30);
        const days = (total % 365) % 30;
        const parts = [];
        if (years) parts.push(plural(years, 'year', 'years'));
        if (months) parts.push(plural(months, 'month', 'months'));
        if (days || !parts.length) parts.push(plural(days, 'day', 'days'));
        return parts.join(', ');
    }

    // ---------------------------------------------------------------- documents

    /** What a document goes by under its row's label («Reports»), which already says the rest. */
    const DOCUMENT_NAMES = {
        'attachment:es-tgss-life-report': 'Work Life',
        'attachment:es-tgss-contribution-base-report': 'Contribution Bases',
        'attachment:es-aeat-model-100': 'Model 100',
        'attachment:es-cirbe-report': 'CIRBE',
    };

    /**
     * A document the source signed: a short name and one short line — until when it is valid,
     * whether its signature checks out, its date, or that its CSV code can check it. Its full name
     * and that code (long, and read only to check the document at the source) are in the tooltip.
     * It opens over the page.
     */
    function documentButton(file) {
        const kind = window.getAttachmentMeta ? window.getAttachmentMeta(file.sub_family) : { name: 'Document', icon: 'fa-file', color: 'slate' };
        const meta = isRecord(file.metadata) ? file.metadata : {};
        const verified = meta['signature-verified'] === true;
        const detail = meta['valid-until'] ? `Valid until ${day(meta['valid-until'])}` : verified ? 'Signature verified'
            : meta['document-date'] ? day(meta['document-date']) : meta['csv-code'] ? 'Verifiable by CSV' : 'PDF';
        const tip = [`Open the ${kind.name}`, meta['csv-code'] ? `CSV ${meta['csv-code']}` : '', verified && meta['valid-until'] ? 'signature verified' : ''].filter(Boolean).join(' · ');
        return `
            <button type="button" class="espa-doc" title="${esc(tip)}" onclick="event.stopPropagation(); openAttachment(this, ${esc(JSON.stringify(String(file.id)))})">
                <span class="espa-doc-icon is-${esc(kind.color)}"><i class="fa-solid ${esc(kind.icon)}"></i></span>
                <span class="espa-doc-text"><b>${esc(DOCUMENT_NAMES[file.sub_family] || kind.name)}</b><small>${detail}</small></span>
                <i class="fa-solid fa-up-right-from-square espa-doc-go"></i>
            </button>`;
    }

    /** The documents a source signed, in a row under their label (none in a card's foot). */
    const documentsRow = (files, label = 'Reports') => {
        const list = listOf(files).filter(file => isRecord(file) && file.id);
        return list.length ? `
            <div class="espa-docs-block">
                ${label ? `<span class="espa-docs-label">${label}</span>` : ''}
                <div class="espa-docs">${list.map(file => safely(documentButton, [file], () => '')).join('')}</div>
            </div>` : '';
    };

    // ---------------------------------------------------------------- Social Security

    /** A work relation's type as the vocabulary names it; one it does not know yet, by its code. */
    const workType = (code) => (window.INFONITE_ENUMS?.WORK_RELATION_TYPES || {})[code] || { label: code ? titleCase(String(code).replace(/_/g, ' ')) : 'Work', icon: 'fa-briefcase' };

    const MONTH_STATES = {
        registered: { label: 'Registered', icon: 'fa-circle-check', tone: 'is-ok' },
        pending_update: { label: 'Pending update', icon: 'fa-hourglass-half', tone: 'is-warn' },
        not_yet_settled: { label: 'Not yet settled', icon: 'fa-clock', tone: 'is-info' },
        not_yet_elapsed: { label: 'Not yet elapsed', icon: 'fa-calendar-plus', tone: 'is-quiet' },
        no_base_registered: { label: 'No base registered', icon: 'fa-circle-minus', tone: 'is-quiet' },
        no_alta: { label: 'Not registered', icon: 'fa-user-slash', tone: 'is-quiet' },
    };
    const monthState = (status) => MONTH_STATES[status] || { label: status ? titleCase(String(status).replace(/_/g, ' ')) : 'Unknown', icon: 'fa-circle-question', tone: 'is-quiet' };

    const FLOOR_STATES = {
        computed: { label: 'Floor computed', tone: 'is-ok', text: 'Certified by the contribution bases: real income can only be equal or higher. A certified lower bound, never a salary estimate.' },
        not_currently_active: { label: 'No current employment', tone: 'is-quiet', text: 'No ongoing employment, so the current guaranteed floor is zero.' },
        insufficient_data: { label: 'Insufficient data', tone: 'is-warn', text: 'The person is active, but there is no certified window to measure a floor from.' },
        activity_unknown: { label: 'Activity unknown', tone: 'is-warn', text: 'No employment evidence either way: no floor is claimed.' },
    };

    /** The Social Security's summary: the days it counts, what the person does now, their number and the reports it signed. */
    function workLifeHero(labor) {
        const days = countOf(labor.social_security_days);
        const relations = listOf(labor.work_relations_history).filter(isRecord);
        const ssn = listOf(data().customer?.profile?.identification_numbers).find(id => id?.type === 'es:ssn')?.value;
        const first = relations.map(rel => rel.activity_start).filter(value => typeof value === 'string').sort()[0];
        const status = labor.currently_active === true ? tag('Currently working', 'is-ok') : labor.currently_active === false ? tag('Not working', 'is-quiet') : tag('Activity unknown', 'is-warn');
        const types = listOf(labor.current_work_types).filter(type => typeof type === 'string').map(type => tag(esc(workType(type).label))).join('');
        return `
            <section class="espa-hero">
                <div class="espa-hero-main">
                    <div class="espa-hero-tags">${status}${types}</div>
                    <div class="espa-figure"><b>${days !== null ? qty(days) : '—'}</b><span>days counted</span></div>
                    <p class="espa-hero-sub">${days !== null ? `${esc(humanDays(days))} over the whole career` : 'The source gave no total'} · simultaneous jobs count once</p>
                    ${documentsRow(labor.attachments)}
                </div>
                <div class="espa-hero-aside">
                    ${ledger([
                        fact('Social Security number', ssn ? `<span class="rk-mono">${esc(ssn)}</span>` : ''),
                        fact('Employment periods', relations.length ? String(relations.length) : ''),
                        fact('First registered', first ? day(first) : ''),
                        fact('Holder', labor.holder_name ? esc(labor.holder_name) : ''),
                        fact('Read on', labor.fetch_date ? day(labor.fetch_date) : ''),
                    ])}
                </div>
            </section>`;
    }

    /** The guaranteed income floor: what the contribution bases certify the person earns at least. */
    function floorCard(floor) {
        const state = FLOOR_STATES[floor.status] || FLOOR_STATES.activity_unknown;
        const computed = floor.status === 'computed';
        const rate = floor.estimated_deduction_rate !== null && floor.estimated_deduction_rate !== undefined && Number.isFinite(Number(floor.estimated_deduction_rate)) ? Number(floor.estimated_deduction_rate) : null;
        const months = countOf(floor.observed_months);
        const companies = listOf(floor.companies).filter(isRecord);
        const employers = computed && companies.length ? `
            <div class="espa-flush">
                <table class="rk-table">
                    <thead><tr><th>Contributing employer</th><th class="text-right">Months</th><th class="text-right">Monthly net, at least</th><th class="text-right espa-wide">Monthly gross</th><th class="text-right espa-wide">Annual net</th></tr></thead>
                    <tbody>${companies.map(company => `
                        <tr>
                            <td><b>${esc(company.company_name || 'Unknown')}</b><small>${esc([company.work_type ? workType(company.work_type).label : '', company.ccc ? `CCC ${company.ccc}` : '', company.basis ? String(company.basis).replace(/_/g, ' ') : ''].filter(Boolean).join(' · '))}</small></td>
                            <td class="text-right espa-num">${countOf(company.observed_months) ?? '—'}</td>
                            <td class="text-right espa-num"><b>${money(company.monthly_floor)}</b></td>
                            <td class="text-right espa-num espa-wide">${money(company.gross_monthly_floor)}</td>
                            <td class="text-right espa-num espa-wide">${money(company.annual_floor)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : '';
        return card({
            title: 'Guaranteed income floor',
            tags: tag(esc(state.label), state.tone),
            main: computed && has(floor.monthly_floor) ? amount('Monthly net, at least', `≥ ${money(floor.monthly_floor)}`, { tone: 'is-positive' }) : '',
            facts: computed ? [
                fact('Annual net, at least', has(floor.annual_floor) ? `≥ ${money(floor.annual_floor)}` : ''),
                fact('Monthly gross', has(floor.gross_monthly_floor) ? money(floor.gross_monthly_floor) : ''),
                fact('Annual gross', has(floor.gross_annual_floor) ? money(floor.gross_annual_floor) : ''),
                fact('Deductions, estimated', rate !== null ? share(rate) : ''),
                fact('Certified months', months !== null ? String(months) : ''),
            ] : [],
            below: `<p class="espa-note">${esc(state.text)}</p>`,
            after: employers,
        });
    }

    /**
     * A work relation on the timeline. A period that is not a job — paid vacations not taken, a
     * benefit — is drawn apart (hatched, dashed, in amber, and said in words), so it never reads as an
     * employer. The tags sit over the name, where they always are, however long the name is.
     */
    function relationItem(rel, index) {
        const special = rel.assimilated === true || rel.work_type === 'vacations' || rel.work_type === 'unemployment_benefits';
        const active = !rel.activity_end;
        const kind = workType(rel.work_type);
        const days = countOf(rel.social_security_days);
        const contract = [rel.contract_type, rel.work_schedule].filter(part => part && part !== 'unknown').map(part => titleCase(String(part).replace(/_/g, ' '))).join(' · ');
        return `
            <div class="espa-relation${special ? ' is-special' : ''}${active ? ' is-active' : ''}" data-i="${index}">
                <span class="espa-relation-dot" title="${esc(kind.label)}"><i class="fa-solid ${esc(kind.icon)}"></i></span>
                ${card({
                    title: rel.name || kind.label,
                    above: true,
                    tags: (special ? tag('<i class="fa-solid fa-circle-info"></i>&nbsp;Not an employment relation', 'is-warn') : '') + tag(esc(kind.label), special ? 'is-quiet' : '') + (active ? tag('active', 'is-ok') : ''),
                    sub: `<span>${rel.activity_start ? day(rel.activity_start) : '?'} – ${rel.activity_end ? day(rel.activity_end) : 'today'}</span>`,
                    main: days !== null ? amount('Days', qty(days), { sub: esc(humanDays(days)) }) : '',
                    facts: [
                        fact('Regime', rel.regime ? esc(titleCase(rel.regime)) : ''),
                        fact('Employer account (CCC)', rel.ccc ? `<span class="rk-mono">${esc(rel.ccc)}</span>` : ''),
                        fact('Contribution group', rel.contribution_group ? esc(rel.contribution_group) : ''),
                        fact('Contract', esc(contract)),
                    ],
                })}
            </div>`;
    }

    /** What a relation can be found by: who, what kind, its accounts and its dates. */
    function relationText(rel) {
        return [rel.name, rel.regime, rel.ccc, rel.contribution_group, rel.contract_type, rel.work_schedule, workType(rel.work_type).label,
            rel.activity_start, rel.activity_end, rel.activity_start ? day(rel.activity_start) : '', rel.activity_end ? day(rel.activity_end) : 'today active',
        ].filter(Boolean).map(part => String(part).replace(/_/g, ' ')).join(' ');
    }

    /** A month's place in the bases grid: the base the Seguridad Social registered, or the state the month is in. */
    function baseCell(month) {
        if (!month) return '<td class="is-none" title="No record for this month">·</td>';
        const state = monthState(month.status);
        if (month.status === 'registered' && has(month.base)) {
            return `<td class="${month.provisional ? 'is-provisional' : ''}" title="${esc(`${money(month.base)}${month.provisional ? ' · provisional: the TGSS may still regularize it' : ''}`)}">${money({ amount: month.base.amount, currency: '' })}</td>`;
        }
        return `<td class="is-state ${state.tone}" title="${esc(state.label)}"><i class="fa-solid ${state.icon}"></i></td>`;
    }

    /** One employer account's bases, as a year-by-month grid: the whole history at a glance. */
    function basesGrid(company) {
        const years = new Map();
        listOf(company.months).filter(isRecord).forEach(month => {
            const date = String(month.date || '');
            const year = countOf(month.year) ?? countOf(date.slice(0, 4));
            const number = countOf(month.month) ?? countOf(date.slice(5, 7));
            if (!year || !number || number < 1 || number > 12) return;
            if (!years.has(year)) years.set(year, new Map());
            years.get(year).set(number, month);
        });
        if (!years.size) return '<p class="rk-muted">No monthly data.</p>';
        const rows = [...years.keys()].sort((a, b) => b - a).map(year => `
            <tr><th scope="row">${year}</th>${MONTHS.map((_, i) => baseCell(years.get(year).get(i + 1))).join('')}</tr>`).join('');
        return `
            <div class="rk-table-card espa-bases-card">
                <table class="rk-table espa-bases">
                    <thead><tr><th>Year</th>${MONTHS.map(name => `<th>${name}</th>`).join('')}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    const BASES_LEGEND = `
        <div class="espa-legend">
            <span><i class="espa-legend-dot is-provisional"></i>Provisional base</span>
            <span><i class="fa-solid fa-hourglass-half is-warn"></i>Pending update</span>
            <span><i class="fa-solid fa-clock is-info"></i>Not yet settled</span>
            <span><i class="fa-solid fa-circle-minus"></i>No base registered</span>
            <span><b>·</b>No record</span>
        </div>`;

    /** A public pension: what it is, since when, gross and net, and the share of it received net. */
    function pensionCard(pension) {
        const amounts = isRecord(pension.amounts) ? pension.amounts : {};
        const gross = has(amounts.total) ? amounts.total : null;
        const net = has(amounts.net_amount) ? amounts.net_amount : null;
        const kept = gross && net && Number(gross.amount) > 0 && (gross.currency || '') === (net.currency || '') ? Number(net.amount) / Number(gross.amount) : null;
        return card({
            title: pension.product_alias || pension.product_name || 'State pension',
            tags: pension.product_alias && pension.product_name ? tag(esc(pension.product_name), 'is-quiet') : '',
            sub: pension.start_date ? `<span>Since ${day(pension.start_date)}</span>` : '',
            main: gross ? amount('Gross', money(gross)) : net ? amount('Net', money(net)) : '',
            gauge: kept !== null ? meter(kept, { left: `<b>${share(kept)}</b> received net`, right: `${money(net)} net` }) : '',
            facts: [
                fact('Base', has(amounts.base) ? money(amounts.base) : ''),
                fact('Revaluation', has(amounts.revaluation) ? money(amounts.revaluation, { sign: true }) : ''),
                fact('Net', gross && net ? money(net) : ''),
            ],
        });
    }

    let workLifeTab = 'relations';

    function renderWorkLife() {
        const employment = isRecord(data().employment) ? data().employment : {};
        const labor = isRecord(employment.labor_check) ? employment.labor_check : null;
        const pensions = listOf(employment.pensions).filter(isRecord);
        if (!labor && !pensions.length) return page('work_life', empty(VIEWS.work_life.icon, 'Nothing returned', 'The Seguridad Social returned no labour record and no pension for this person.'));
        const relations = labor ? listOf(labor.work_relations_history).filter(isRecord) : [];
        const companies = labor ? listOf(labor.contribution_base_by_company).filter(isRecord) : [];
        const flat = labor ? listOf(labor.contribution_base_history).filter(isRecord) : [];
        const bases = companies.length ? companies : flat.length ? [{ company_name: '', months: flat }] : [];
        const monthCount = bases.reduce((n, company) => n + listOf(company.months).filter(isRecord).length, 0);
        index('espaRelations', relations, relationText);
        const tabs = [
            { key: 'relations', icon: 'fa-building-user', label: 'Relations', long: 'Work relations', count: relations.length },
            { key: 'bases', icon: 'fa-money-bill-trend-up', label: 'Bases', long: 'Contribution bases', count: monthCount },
            { key: 'pensions', icon: 'fa-piggy-bank', label: 'Pensions', long: 'State pensions', count: pensions.length },
        ];
        if (!tabs.some(t => t.key === workLifeTab && t.count)) workLifeTab = (tabs.find(t => t.count) || tabs[0]).key;
        const panel = (key, body) => `<div class="espa-panel${key === workLifeTab ? ' is-on' : ''}" data-panel="${key}">${body}</div>`;
        const relationsBody = relations.length
            ? section('fa-solid fa-building-user', 'Employment periods', `<span id="espaRelationsCount">${relations.length}</span>`,
                `<div class="espa-timeline" id="espaRelations">${relations.map((rel, i) => safely(relationItem, [rel, i], () => `<div data-i="${i}">${broken(rel.name || 'A work relation')}</div>`)).join('')}${searchNone('No employment period matches the search.')}</div>`,
                relations.length > 3 ? searchBox({ target: 'espaRelations', placeholder: 'Search periods', label: 'Search the employment periods', title: 'Employer, regime, CCC, group, contract or date — every word must match; quotes keep a phrase together' }) : '')
            : empty('fa-solid fa-building-user', 'No employment periods', 'The report lists no work relation.');
        const basesBody = bases.length
            ? section('fa-solid fa-money-bill-trend-up', 'Contribution bases', monthCount, `
                ${bases.map(company => `
                    <div class="espa-group">
                        ${company.company_name ? `<b>${esc(company.company_name)}</b>` : '<b>Contribution history</b>'}
                        <small>${esc([company.regime ? titleCase(company.regime) : '', company.ccc ? `CCC ${company.ccc}` : ''].filter(Boolean).join(' · '))}</small>
                        ${company.is_benefit_block ? tag('Benefit, not earned income', 'is-warn') : ''}
                        <span class="espa-group-rule"></span>
                    </div>
                    ${safely(basesGrid, [company], () => broken(company.company_name || 'The bases'))}`).join('')}
                ${BASES_LEGEND}`)
            : empty('fa-solid fa-money-bill-trend-up', 'No contribution bases', 'The report lists no monthly base.');
        const pensionsBody = pensions.length
            ? section('fa-solid fa-piggy-bank', 'State pensions', pensions.length, `<div class="rk-stack">${pensions.map(p => safely(pensionCard, [p], () => broken(p.product_alias || p.product_name || 'A pension'))).join('')}</div>`)
            : empty('fa-solid fa-piggy-bank', 'No pensions', 'The Seguridad Social returned no public pension for this person.');
        return page('work_life',
            labor ? safely(workLifeHero, [labor], () => broken('The Social Security summary')) : '',
            labor && isRecord(labor.income_floor) ? safely(floorCard, [labor.income_floor], () => broken('Guaranteed income floor')) : '',
            `<div class="espa-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" class="espa-tab${t.key === workLifeTab ? ' is-active' : ''}" data-tab="${t.key}" onclick="ESPA.tab('${t.key}')"><i class="fa-solid ${t.icon}"></i><span class="sm:hidden">${t.label}</span><span class="hidden sm:inline">${t.long}</span><em>${t.count}</em></button>`).join('')}</div>`,
            panel('relations', relationsBody),
            panel('bases', basesBody),
            panel('pensions', pensionsBody));
    }

    /** Shows one of the Social Security's tabs. */
    function tab(key) {
        workLifeTab = key;
        document.querySelectorAll('.espa-tab').forEach(button => button.classList.toggle('is-active', button.dataset.tab === key));
        document.querySelectorAll('.espa-panel').forEach(panel => panel.classList.toggle('is-on', panel.dataset.panel === key));
    }

    // ---------------------------------------------------------------- the driver and their vehicles

    /** The driving licence as the plastic reads: surnames, name, number, the photograph and every category with its expiry. */
    function licenceCard(driver) {
        const licences = listOf(driver.licences).filter(isRecord);
        const categories = licences.map(lic => {
            const expires = typeof lic.expires === 'string' ? lic.expires : '';
            const expired = Boolean(expires && expires < today());
            const title = [lic.date ? `Since ${day(lic.date)}` : '', expires ? `${expired ? 'Expired' : 'Until'} ${day(expires)}` : 'No expiry'].filter(Boolean).join(' · ');
            return `<span class="espa-cat${expired ? ' is-expired' : ''}" title="${esc(title)}"><b>${esc(lic.category || '?')}</b><small>${expires ? esc(expires.slice(0, 4)) : '∞'}</small></span>`;
        }).join('');
        return `
            <div class="espa-licence">
                <div class="espa-licence-top">
                    <span class="espa-licence-eu"><img src="${flagUrl('EU')}" alt=""><b>E</b></span>
                    <div><b>Permiso de conducción</b><small>Driving licence · DGT</small></div>
                </div>
                <div class="espa-licence-body">
                    <div class="espa-licence-photo" id="espaDriverPhoto"><i class="fa-solid fa-user"></i></div>
                    <dl class="espa-licence-data">
                        <div><dt>1</dt><dd>${esc(driver.name_extra || '—')}</dd></div>
                        <div><dt>2</dt><dd>${esc(driver.name || '—')}</dd></div>
                        <div><dt>5</dt><dd class="rk-mono">${esc(driver.identifier?.value || '—')}</dd></div>
                    </dl>
                </div>
                <div class="espa-licence-cats">${categories || '<span class="espa-cat is-none">No licence on record</span>'}</div>
            </div>`;
    }

    function driverHero(driver) {
        const licences = listOf(driver.licences).filter(isRecord);
        const until = licences.map(lic => lic.expires).filter(value => typeof value === 'string').sort().pop();
        const points = countOf(driver.point_balance);
        const authorization = (value) => (value === true ? 'Authorized' : value === false ? 'Not authorized' : '');
        return `
            <section class="espa-hero is-licence">
                ${licenceCard(driver)}
                <div class="espa-hero-aside">
                    ${ledger([
                        points !== null ? fact('Points', `${points}`, { main: true, sub: 'on the driving licence' }) : null,
                        fact('Licences', licences.length ? plural(licences.length, 'category', 'categories') : ''),
                        fact('Valid until', until ? day(until) : ''),
                        fact('Dangerous goods', authorization(driver.dangerous_goods_authorized)),
                        fact('School transport', authorization(driver.school_transport_authorized)),
                        fact('Address', driver.address ? esc(titleCase(driver.address)) : ''),
                    ])}
                </div>
            </section>`;
    }

    /** What the registry flags on a vehicle, as the vocabulary names it. */
    const vehicleFlag = (code) => ({ code, ...((window.INFONITE_ENUMS?.VEHICLE_INCIDENT_FLAGS || {})[code] || { label: titleCase(String(code).replace(/_/g, ' ')), icon: 'fa-flag', text: '' }) });

    /** A vehicle: make and model, its plate and environmental label, its figures, and what the registry holds against it. */
    function vehicleCard(veh, index) {
        const report = isRecord(veh.simple_vehicle_report) ? veh.simple_vehicle_report : null;
        const flags = listOf(report?.flags).filter(flag => typeof flag === 'string').map(vehicleFlag);
        const alert = report?.has_incidents === true || flags.length > 0;
        const make = typeof veh.make === 'string' ? veh.make.trim() : '';
        const model = typeof veh.model === 'string' ? veh.model.trim() : '';
        const title = model && make && !model.toUpperCase().startsWith(make.toUpperCase()) ? `${make} ${model}` : model || make || 'Vehicle';
        const slug = make.toLowerCase().replace(/[^a-z0-9]/g, '');
        const logo = slug
            ? `<img src="https://cdn.simpleicons.org/${slug}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-car-side' }))">`
            : '<i class="fa-solid fa-car-side"></i>';
        const emission = typeof veh.emission_class === 'string' ? veh.emission_class.replace('ES:', '') : '';
        const badge = emission.toLowerCase().replace(/[^a-z0-9]/g, '');
        const label = emission ? `<span class="espa-label" title="Environmental label ${esc(emission)}"><img src="https://estaticos.redsara.es/carpetaciudadana/3.8-ccfront//img/nuevaCarpeta/imagenes/etiqueta-ambiental-${badge === '0' || badge === 'zero' ? 'cero' : badge}.png" alt="${esc(emission)}" onerror="this.replaceWith(document.createTextNode(this.alt))"></span>` : '';
        const insurance = isRecord(veh.insurance) ? veh.insurance : null;
        const inspection = typeof veh.inspection_expiry_date === 'string' ? veh.inspection_expiry_date : '';
        const lapsed = Boolean(inspection && inspection < today());
        const mileage = countOf(veh.mileage);
        const checkedOn = report?.report_date ? day(report.report_date) : '';
        const verdict = !report
            ? '<p class="espa-verdict is-none"><i class="fa-solid fa-circle-question"></i>No report came for this vehicle.</p>'
            : alert ? `
                <div class="espa-verdict is-alert">
                    <div class="espa-verdict-head"><i class="fa-solid fa-triangle-exclamation"></i><b>${flags.length ? plural(flags.length, 'red flag', 'red flags') : 'Incidents on record'}</b>${checkedOn ? `<small>Checked ${checkedOn}</small>` : ''}</div>
                    <p>The registry holds annotations that prevent administrative processing or the circulation of this vehicle.${flags.length ? '' : ' Request a full vehicle report for the details.'}</p>
                    ${flags.length ? `<ul>${flags.map(flag => `<li><i class="fa-solid ${esc(flag.icon)}"></i><span><b>${esc(flag.label)}</b>${flag.text ? ` ${esc(flag.text)}` : ''}</span></li>`).join('')}</ul>` : ''}
                </div>`
                : `<p class="espa-verdict is-clear"><i class="fa-solid fa-circle-check"></i>No incidents on record${checkedOn ? ` · checked ${checkedOn}` : ''}</p>`;
        return `
            <article class="rk-card espa-vehicle${alert ? ' is-alert' : ''}" data-i="${index}">
                <header class="rk-card-head">
                    <span class="espa-make">${logo}</span>
                    <div class="rk-card-id">
                        <div class="rk-card-title"><h3 title="${esc(title)}">${esc(title)}</h3>${label}${alert ? tag('incidents', 'is-bad') : ''}</div>
                        <div class="rk-card-sub">${subLine(esc(make), veh.fuel_type ? esc(titleCase(veh.fuel_type)) : '', veh.administrative_situation ? esc(titleCase(veh.administrative_situation)) : '')}</div>
                    </div>
                    <span class="espa-plate"><span class="espa-plate-eu"><img src="${flagUrl('EU')}" alt=""><b>E</b></span><b>${esc(veh.license_plate || '—')}</b></span>
                </header>
                ${facts([
                    fact('Mileage', mileage !== null ? `<span class="espa-odometer">${esc(String(Math.round(mileage)).padStart(6, '0'))}</span> km` : ''),
                    fact('Registered', veh.registration_date ? day(veh.registration_date) : '', { sub: veh.last_registration_date && veh.last_registration_date !== veh.registration_date ? `Last ${day(veh.last_registration_date)}` : '' }),
                    fact('Inspection (ITV)', inspection ? `${lapsed ? 'Expired' : 'Until'} ${day(inspection)}` : '', { tone: lapsed ? 'is-negative' : '', sub: veh.inspection_pending ? 'pending' : '' }),
                    fact('Insurance', insurance ? `<span title="${esc(insurance.company || '')}">${esc(insurance.company || '—')}</span>` : '', { sub: insurance ? `${insurance.is_active ? 'Active' : 'Not active'}${insurance.start_date ? ` since ${day(insurance.start_date)}` : ''}` : '', tone: insurance && !insurance.is_active ? 'is-negative' : '' }),
                    fact('Frame number (VIN)', veh.vin ? `<span class="rk-mono" title="${esc(veh.vin)}">${esc(veh.vin)}</span>` : '', { wide: true }),
                ])}
                ${verdict}
            </article>`;
    }

    /** What a vehicle can be found by: plate, make, model, fuel, frame number, its flags and its insurer. */
    function vehicleText(veh) {
        const flags = listOf(veh.simple_vehicle_report?.flags).map(flag => vehicleFlag(flag).label);
        return [veh.license_plate, veh.make, veh.model, veh.fuel_type, veh.vin, veh.emission_class, veh.administrative_situation, veh.insurance?.company,
            veh.simple_vehicle_report?.has_incidents ? 'incidents' : '', ...flags, veh.registration_date].filter(Boolean).join(' ');
    }

    function renderDriver() {
        const family = isRecord(data().driver) ? data().driver : {};
        const driver = isRecord(family.data) ? family.data : null;
        const vehicles = listOf(family.vehicles).filter(isRecord);
        if (!driver && !vehicles.length) return page('driver', empty(VIEWS.driver.icon, 'Nothing returned', 'The DGT returned no driver record and no vehicle for this person.'));
        index('espaVehicles', vehicles, vehicleText);
        const alerts = vehicles.filter(veh => veh.simple_vehicle_report?.has_incidents === true || listOf(veh.simple_vehicle_report?.flags).length).length;
        const movements = listOf(driver?.point_movements).filter(isRecord);
        return page('driver',
            driver ? safely(driverHero, [driver], () => broken('The driving licence')) : '',
            section('fa-solid fa-car', 'Registered vehicles', `<span id="espaVehiclesCount">${vehicles.length}</span>`,
                vehicles.length
                    ? `${alerts ? `<p class="espa-summary is-alert"><i class="fa-solid fa-triangle-exclamation"></i>${plural(alerts, 'vehicle has', 'vehicles have')} incidents on record.</p>` : ''}<div class="rk-stack" id="espaVehicles">${vehicles.map((veh, i) => safely(vehicleCard, [veh, i], () => `<div data-i="${i}">${broken(veh.license_plate || 'A vehicle')}</div>`)).join('')}${searchNone('No vehicle matches the search.')}</div>`
                    : empty('fa-solid fa-car', 'No vehicles', 'No vehicle is registered in the person\'s name.'),
                vehicles.length > 3 ? searchBox({ target: 'espaVehicles', placeholder: 'Search vehicles', label: 'Search the vehicles', title: 'Plate, make, model, fuel, frame number, red flag or insurer — every word must match; quotes keep a phrase together' }) : ''),
            movements.length ? section('fa-solid fa-clock-rotate-left', 'Points history', movements.length, `
                <div class="rk-table-card"><table class="rk-table">
                    <thead><tr><th>Date</th><th>Movement</th><th class="text-right">Points</th><th class="text-right">Balance</th></tr></thead>
                    <tbody>${movements.map(mov => {
                        const delta = Number(mov.points_delta);
                        return `<tr><td class="espa-num">${mov.date ? day(mov.date) : '—'}</td><td>${esc(mov.description || '—')}</td><td class="text-right espa-num"><b class="${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}">${Number.isFinite(delta) ? `${delta > 0 ? '+' : ''}${delta}` : '—'}</b></td><td class="text-right espa-num">${esc(mov.balance_after ?? '—')}</td></tr>`;
                    }).join('')}</tbody>
                </table></div>`) : '');
    }

    /** Once the licence is on screen, the DGT's photograph takes the place of the silhouette. */
    async function loadDriverPhoto() {
        const slot = document.getElementById('espaDriverPhoto');
        const attachment = window.driverPhotoAttachment ? window.driverPhotoAttachment(results()) : null;
        if (!slot || !attachment || !window.fetchDriverPhotoUrl) return;
        const url = await window.fetchDriverPhotoUrl(attachment);
        if (!url || !document.body.contains(slot)) return;
        slot.replaceChildren(Object.assign(document.createElement('img'), { src: url, alt: 'Driver photograph' }));
        slot.classList.add('has-photo');
    }

    // ---------------------------------------------------------------- taxes

    const taxesOf = () => listOf(data().tax?.individual_yearly).filter(isRecord);
    const yearOf = (tax, i) => String(tax.fiscal_year_start || '').slice(0, 4) || `#${i + 1}`;
    /** How a return is told apart in the page: its fiscal year's start, or its place in the list. */
    const yearKey = (tax, i) => String(tax.fiscal_year_start || i);

    /** The result of a return: to pay when positive, to refund when negative (what the return owes against what was withheld). */
    function resultOf(tax) {
        if (!has(tax.final_tax_result)) return null;
        const value = Number(tax.final_tax_result.amount);
        return { label: value > 0 ? 'To pay' : value < 0 ? 'To refund' : 'Result', text: money({ ...tax.final_tax_result, amount: Math.abs(value) }), tone: value < 0 ? 'is-positive' : '' };
    }

    const STATUS_TONES = { submitted: 'is-ok', amended: 'is-ok', draft: 'is-warn', data: 'is-quiet', not_required: 'is-quiet' };
    const statusTag = (status) => (status ? tag(esc(String(status).replace(/_/g, ' ')), STATUS_TONES[status] || 'is-quiet') : '');

    function yearCard(tax, i) {
        const result = resultOf(tax);
        const income = isRecord(tax.income) ? tax.income : {};
        return card({
            open: call('showYearlyTaxDetails', yearKey(tax, i)),
            title: `Fiscal year ${yearOf(tax, i)}`,
            tags: statusTag(tax.status) + (tax.filing_category ? tag(esc(tax.filing_category), 'is-quiet') : ''),
            sub: subLine(esc(tax.tax_agency || 'AEAT'), tax.fiscal_year_start && tax.fiscal_year_end ? `${day(tax.fiscal_year_start)} – ${day(tax.fiscal_year_end)}` : ''),
            main: result ? amount(result.label, result.text, { tone: result.tone }) : '',
            facts: [
                fact('Taxable base', has(tax.taxable_base) ? money(tax.taxable_base) : ''),
                fact('Tax paid', has(tax.total_tax_paid) ? money(tax.total_tax_paid) : ''),
                fact('Employment', has(income.employment?.total_gross) ? money(income.employment.total_gross) : ''),
                fact('Business', has(income.business?.total_income) && Number(income.business.total_income.amount) ? money(income.business.total_income) : ''),
                fact('Capital', has(income.capital?.total_gross) && Number(income.capital.total_gross.amount) ? money(income.capital.total_gross) : ''),
                fact('Real estate, net', has(income.real_estate?.total_net_income) && Number(income.real_estate.total_net_income.amount) ? money(income.real_estate.total_net_income) : ''),
            ],
            foot: `${documentsRow(tax.attachments, '')}${go('See the return')}`,
        });
    }

    function renderTaxes() {
        const taxes = taxesOf();
        if (!taxes.length) return page('taxes', empty(VIEWS.taxes.icon, 'No returns', 'The Agencia Tributaria returned no personal income tax return for this person.'));
        return page('taxes', section('fa-solid fa-calendar-check', 'Fiscal years', taxes.length,
            `<div class="rk-stack">${taxes.map((tax, i) => safely(yearCard, [tax, i], () => broken(`Fiscal year ${yearOf(tax, i)}`))).join('')}</div>`));
    }

    /** A table of a return's lines: its columns and, for each line, its cells. */
    function linesTable(columns, lines, row) {
        return `
            <div class="rk-table-card">
                <table class="rk-table espa-lines">
                    <thead><tr>${columns.map(([label, align]) => `<th class="${align === 'right' ? 'text-right' : ''}">${label}</th>`).join('')}</tr></thead>
                    <tbody>${lines.map(line => `<tr>${safely(row, [line], () => `<td colspan="${columns.length}">${broken('A line')}</td>`)}</tr>`).join('')}</tbody>
                </table>
            </div>`;
    }

    const who = (name, id, extra = '') => `<td><b>${esc(name || '—')}</b>${id || extra ? `<small>${[id ? `<span class="rk-mono">${esc(id)}</span>` : '', extra].filter(Boolean).join(' · ')}</small>` : ''}</td>`;
    const figure = (value, strong = false) => `<td class="text-right espa-num">${strong ? `<b>${money(value)}</b>` : money(value)}</td>`;

    /** A tax return in full: its result and totals, then each kind of income, the deductions and the loans. */
    function renderYear(key) {
        const taxes = taxesOf();
        const i = taxes.findIndex((tax, n) => yearKey(tax, n) === String(key));
        if (i < 0) return renderTaxes();
        const tax = taxes[i];
        const year = yearOf(tax, i);
        const result = resultOf(tax);
        const income = isRecord(tax.income) ? tax.income : {};
        const deductions = isRecord(tax.deductions) ? tax.deductions : {};
        const lines = (value) => listOf(value).filter(isRecord);
        const employment = lines(income.employment?.lines);
        const business = lines(income.business?.activities);
        const capital = lines(income.capital?.lines);
        const gains = lines(income.capital_gains?.lines);
        const estate = lines(income.real_estate?.properties);
        const donations = lines(deductions.donations);
        const loans = lines(tax.liabilities?.real_estate_loans);
        const total = (value, label) => (has(value) ? `<span class="espa-total">${label} <b>${money(value)}</b></span>` : '');
        // the allowances the return applied, only those it gives a figure for
        const given = (value) => (has(value) && Number(value.amount) ? money(value) : '');
        const allowances = ledger([
            fact('Personal allowance', given(deductions.personal_allowance)),
            fact('Family allowance', given(deductions.family_allowance)),
            fact('Regional deductions', given(deductions.regional_deductions)),
            fact('State deductions', given(deductions.state_deductions)),
            fact('Total deductions', given(deductions.total_deductions)),
        ]);
        const parts = [
            employment.length ? section('fa-solid fa-briefcase', 'Employment income', employment.length, linesTable(
                [['Payer'], ['Gross', 'right'], ['Withheld', 'right'], ['Social Security', 'right']], employment,
                line => who(line.employer_name, line.employer_id) + figure(line.gross_income, true) + figure(line.tax_withheld) + figure(line.social_security_contributions)),
                total(income.employment?.total_gross, 'Gross')) : '',
            business.length ? section('fa-solid fa-store', 'Business income', business.length, linesTable(
                [['Activity'], ['Income', 'right'], ['Withheld', 'right']], business,
                line => who(line.description, line.payer_id, line.activity_code ? `activity ${esc(line.activity_code)}` : '') + figure(line.total_income, true) + figure(line.tax_withheld)),
                total(income.business?.total_income, 'Income')) : '',
            capital.length ? section('fa-solid fa-piggy-bank', 'Capital income', capital.length, linesTable(
                [['Provider'], ['Kind'], ['Gross', 'right'], ['Withheld', 'right'], ['Expenses', 'right']], capital,
                line => who(line.provider_name, line.provider_id, line.account_number ? `account •••• ${esc(String(line.account_number).slice(-4))}` : '') + `<td>${esc(String(line.asset_type || '—').replace(/_/g, ' '))}</td>` + figure(line.gross_income, true) + figure(line.tax_withheld) + figure(line.deductible_expenses)),
                total(income.capital?.total_gross, 'Gross')) : '',
            gains.length ? section('fa-solid fa-arrow-trend-up', 'Capital gains', gains.length, linesTable(
                [['Asset'], ['Sold'], ['Sale value', 'right'], ['Expenses', 'right']], gains,
                line => who(line.asset_description || line.issuer_name, line.issuer_id, line.broker_name ? esc(line.broker_name) : '') + `<td class="espa-num">${line.sale_date ? day(line.sale_date) : '—'}</td>` + figure(line.sale_value, true) + figure(line.sale_expenses))) : '',
            estate.length ? section('fa-solid fa-building', 'Real estate income', estate.length, linesTable(
                [['Property'], ['Gross', 'right'], ['Deductible', 'right'], ['Net', 'right']], estate,
                line => who(line.address, line.cadastral_reference) + figure(line.gross_income) + figure(line.deductible_expenses) + figure(line.net_income, true)),
                total(income.real_estate?.total_net_income, 'Net')) : '',
            donations.length || allowances ? section('fa-solid fa-hand-holding-heart', 'Deductions', donations.length || null, `
                ${allowances ? `<div class="rk-card espa-ledger-card">${allowances}</div>` : ''}
                ${donations.length ? linesTable([['Donation to'], ['Kind'], ['Amount', 'right']], donations,
                    line => who(line.entity_name, line.entity_id) + `<td>${esc(String(line.donation_type || '—').replace(/_/g, ' '))}${line.is_recurring ? ' <span class="rk-tag is-quiet">recurring</span>' : ''}</td>` + figure(line.amount, true)) : ''}`) : '',
            loans.length ? section('fa-solid fa-house-chimney', 'Home loans', loans.length, linesTable(
                [['Lender'], ['Signed'], ['Share', 'right'], ['Capital repaid', 'right'], ['Interest', 'right']], loans,
                line => who(line.lender_name, line.loan_id ? `•••• ${String(line.loan_id).slice(-6)}` : '') + `<td class="espa-num">${line.formalization_date ? day(line.formalization_date) : '—'}</td>` + `<td class="text-right espa-num">${Number.isFinite(Number(line.participation)) && line.participation !== null && line.participation !== '' ? share(Number(line.participation) > 1 ? Number(line.participation) / 100 : Number(line.participation)) : '—'}</td>` + figure(line.amortized_capital, true) + figure(line.interests))) : '',
        ].filter(Boolean);
        return `
            <div class="rk-page">
                ${R.crumbs({ label: 'Taxes', open: "switchDashboardView('taxes')", title: `Fiscal year ${year}` })}
                <section class="espa-hero">
                    <div class="espa-hero-main">
                        <div class="espa-hero-tags">${statusTag(tax.status)}${tax.filing_category ? tag(esc(tax.filing_category), 'is-quiet') : ''}</div>
                        <h2 class="espa-hero-title">Fiscal year ${esc(year)}</h2>
                        ${result ? `<div class="espa-figure is-money"><span>${result.label}</span><b class="${result.tone}">${result.text}</b></div>` : ''}
                        <p class="espa-hero-sub">${esc(tax.tax_agency || 'AEAT')}${tax.fiscal_year_start && tax.fiscal_year_end ? ` · ${day(tax.fiscal_year_start)} – ${day(tax.fiscal_year_end)}` : ''}</p>
                        ${documentsRow(tax.attachments, 'Documents')}
                    </div>
                    <div class="espa-hero-aside">
                        ${ledger([
                            fact('Taxable base', has(tax.taxable_base) ? money(tax.taxable_base) : ''),
                            fact('Tax paid or withheld', has(tax.total_tax_paid) ? money(tax.total_tax_paid) : ''),
                            fact('Total deductions', has(deductions.total_deductions) ? money(deductions.total_deductions) : ''),
                            fact('Taxpayer', tax.primary_taxpayer ? `<span class="rk-mono">${esc(tax.primary_taxpayer)}</span>` : ''),
                            fact('Joint taxpayers', listOf(tax.joint_taxpayers).length ? listOf(tax.joint_taxpayers).map(esc).join(', ') : ''),
                        ])}
                    </div>
                </section>
                ${parts.join('') || empty('fa-solid fa-file-invoice', 'No lines', 'The return came without any income line.')}
            </div>`;
    }

    // ---------------------------------------------------------------- the credit registry (CIRBE)

    // CIRBE vocabularies, as the core publishes them (infonite.enums.engines.products._credit_registry)
    const CIRBE_PRODUCT = {
        securities_lending: 'Securities lending', trade_credit_with_recourse: 'Trade credit with recourse', trade_credit_without_recourse: 'Trade credit without recourse',
        trade_receivables: 'Trade receivables', financial_credit: 'Financial credit', financial_lease: 'Financial lease', reverse_repurchase_agreement: 'Reverse repurchase agreement',
        debt_securities: 'Debt securities', financial_guarantee: 'Financial guarantee', forward_deposit: 'Forward deposit', non_financial_guarantee: 'Non-financial guarantee',
        irrevocable_documentary_credit: 'Irrevocable documentary credit', available_in_other_commitments: 'Other commitments', overdraft: 'Overdraft',
        credit_card_debt: 'Credit card debt', deposit: 'Deposit', revolving_credit: 'Revolving credit', credit_line: 'Credit line', other_loans: 'Other loans',
    };
    const CIRBE_ROLE = { direct_holder: 'Direct holder', guarantor: 'Guarantor', bill_signatory: 'Bill signatory' };
    const CIRBE_MATURITY = { up_to_three_months: 'Up to 3 months', three_months_to_one_year: '3 months to 1 year', one_to_five_years: '1 to 5 years', over_five_years: 'Over 5 years', indeterminate: 'Indeterminate' };
    const CIRBE_JOINT = { joint_and_several: 'Joint and several', collective: 'Collective', not_joint_and_several: 'Not joint and several' };
    const CIRBE_REAL = {
        financial_assets_pledge: 'Pledge of financial assets', real_estate_mortgage: 'Real estate mortgage', other_real_guarantee: 'Other real guarantee', life_insurance_pledge: 'Pledge of life insurance',
        other_physical_collateral: 'Other physical collateral', credit_derivatives: 'Credit derivatives', financial_guarantee_other_than_credit_derivatives: 'Financial guarantee', other_protection: 'Other protection',
        residential_real_estate: 'Residential property', offices_and_commercial_premises: 'Offices and commercial premises', commercial_real_estate: 'Commercial property', debt_securities: 'Debt securities',
        gold: 'Gold', cash_and_deposits: 'Cash and deposits', loans: 'Loans', trade_receivables: 'Trade receivables', equity_and_investment_fund_shares: 'Shares and fund units',
    };
    const CIRBE_PERSONAL = { public_administration: 'Public administration', other_personal_guarantee: 'Other personal guarantee', reporting_entity: 'Reporting entity', public_credit_insurer: 'Public credit insurer', unspecified: 'Unspecified' };
    const CIRBE_COVERAGE = { total: 'total coverage', partial: 'partial coverage' };

    /** A value of a CIRBE vocabulary: its label, or — one the vocabulary does not know yet — its code in words. */
    const cirbe = (map, value, code) => (value ? map[value] || titleCase(String(value).replace(/_/g, ' ')) : code || '');

    const term = (icon, text, tone = '') => `<span class="espa-term${tone ? ` ${tone}` : ''}"><i class="fa-solid ${icon}"></i>${esc(text)}</span>`;

    /** An operation's line: what it is and the person's role in it, its terms, and its four figures. */
    function operationRow(op, index) {
        const terms = [];
        if (op.intervention_nature || op.intervention_nature_code) terms.push(term(op.intervention_nature === 'guarantor' ? 'fa-user-shield' : 'fa-user', cirbe(CIRBE_ROLE, op.intervention_nature, op.intervention_nature_code), op.intervention_nature === 'guarantor' ? 'is-warn' : 'is-info'));
        if (op.maturity_type || op.maturity_type_code) terms.push(term('fa-hourglass-half', cirbe(CIRBE_MATURITY, op.maturity_type, op.maturity_type_code)));
        if ((op.real_guarantee_type && op.real_guarantee_type !== 'none') || (!op.real_guarantee_type && op.real_guarantee_type_code)) terms.push(term('fa-house-lock', `${cirbe(CIRBE_REAL, op.real_guarantee_type, op.real_guarantee_type_code)}${op.real_guarantee_coverage ? ` · ${CIRBE_COVERAGE[op.real_guarantee_coverage] || op.real_guarantee_coverage}` : ''}`, 'is-ok'));
        if ((op.personal_guarantee_type && op.personal_guarantee_type !== 'none') || (!op.personal_guarantee_type && op.personal_guarantee_type_code)) terms.push(term('fa-handshake', `${cirbe(CIRBE_PERSONAL, op.personal_guarantee_type, op.personal_guarantee_type_code)}${op.personal_guarantee_coverage ? ` · ${CIRBE_COVERAGE[op.personal_guarantee_coverage] || op.personal_guarantee_coverage}` : ''}`, 'is-ok'));
        if (op.collective_status || op.collective_status_code) terms.push(term('fa-link', cirbe(CIRBE_JOINT, op.collective_status, op.collective_status_code)));
        const participants = countOf(op.participants_number);
        if (participants) terms.push(term('fa-users', plural(participants, 'participant', 'participants')));
        const cell = (value, tone) => {
            if (!has(value)) return '<td class="text-right espa-num is-none">—</td>';
            const n = Number(value.amount);
            return `<td class="text-right espa-num ${n === 0 ? 'is-zero' : ''}"><b class="${n > 0 && tone ? tone : ''}">${money(value)}</b></td>`;
        };
        return `
            <tr data-i="${index}">
                <td class="espa-op">
                    <b>${esc(cirbe(CIRBE_PRODUCT, op.product_type, op.product_type_code) || 'Operation')}</b>
                    ${op.operation_code ? `<small class="rk-mono" title="${esc(op.operation_code)}">${esc(op.operation_code)}</small>` : ''}
                    <div class="espa-terms">${terms.join('')}</div>
                </td>
                ${cell(op.total_drawn)}${cell(op.risk_available)}${cell(op.overdue, 'is-negative')}${cell(op.arrears, 'is-negative')}
            </tr>`;
    }

    /** What the report did not come with, and why: what the session said about Cl@ve, then the usual reasons. */
    function cirbeUnavailable() {
        const reasons = listOf(results().messages).filter(message => {
            const at = listOf(message?.location).join('.');
            if (message?.message_id === 'clave_level_insufficient') return at === 'data.credit.registry';
            return ['clave_not_registered', 'clave_access_unavailable'].includes(message?.message_id);
        });
        const usual = [
            ['fa-id-card', 'Insufficient Cl@ve level.', 'The Banco de España only serves the report to people identified with an electronic certificate, DNIe or Cl@ve registered at the advanced level (in person). A basic Cl@ve is not enough.'],
            ['fa-user-lock', 'No Cl@ve or certificate.', 'The person holds none of the credentials above, so the request could not be made.'],
            ['fa-plug-circle-xmark', 'Source unavailable.', "The Banco de España's service did not answer, or the request did not finish during the session."],
        ];
        return page('credit_registry',
            empty('fa-solid fa-money-check-dollar', 'No report in this session', 'The Central Credit Registry report could not be obtained in this session. That does not mean the person has no debts: the report was simply not obtained.'),
            reasons.length ? section('fa-solid fa-circle-info', 'What the session says', reasons.length, `<div class="rk-stack">${reasons.map(message => `<p class="espa-said"><i class="fa-solid fa-circle-info"></i>${esc(message.message || message.message_id)}</p>`).join('')}</div>`) : '',
            section('fa-solid fa-list-check', reasons.length ? 'Other common reasons' : 'Most common reasons', null, `<div class="rk-card espa-reasons">${usual.map(([icon, title, text]) => `<p><i class="fa-solid ${icon}"></i><span><b>${title}</b> ${text}</span></p>`).join('')}</div>`));
    }

    function cirbeHero(report) {
        const drawn = has(report.total_drawn) ? Number(report.total_drawn.amount) : null;
        const available = has(report.total_risk_available) ? Number(report.total_risk_available.amount) : null;
        const granted = drawn !== null && available !== null ? drawn + available : 0;
        const part = granted > 0 ? drawn / granted : null;
        const month = /^(\d{2})-(\d{4})$/.exec(String(report.report_month || ''));
        const file = listOf(report.attachments).find(att => isRecord(att) && att.id);
        const signed = file?.metadata?.['signature-verified'] === true;
        const overdue = has(report.total_overdue) ? Number(report.total_overdue.amount) : 0;
        const arrears = has(report.total_arrears) ? Number(report.total_arrears.amount) : 0;
        return `
            <section class="espa-hero">
                <div class="espa-hero-main">
                    <div class="espa-hero-tags">${tag(month ? `Report of ${day(`${month[2]}-${month[1]}-01`, { month: true })}` : esc(report.report_month || 'Report'), 'is-quiet')}${signed ? tag('<i class="fa-solid fa-signature"></i> signature verified', 'is-ok') : file ? tag('unsigned', 'is-warn') : ''}${overdue > 0 || arrears > 0 ? tag('arrears reported', 'is-bad') : ''}</div>
                    <div class="espa-figure is-money"><span>Total drawn</span><b>${money(report.total_drawn)}</b></div>
                    ${part !== null ? meter(part, { left: `<b>${share(part)}</b> of the credit granted is drawn`, right: `${money({ ...report.total_drawn, amount: granted })} granted`, tone: part >= 0.9 ? 'is-high' : part >= 0.7 ? 'is-mid' : '' }) : ''}
                    <p class="espa-hero-sub">${report.consultation_date ? `Consulted ${day(report.consultation_date)}` : ''}${report.holder_name ? ` · ${esc(report.holder_name)}` : ''}</p>
                    ${documentsRow(report.attachments, 'Report')}
                </div>
                <div class="espa-hero-aside">
                    ${ledger([
                        fact('Available', has(report.total_risk_available) ? money(report.total_risk_available) : ''),
                        fact('Overdue', has(report.total_overdue) ? money(report.total_overdue) : '', { tone: overdue > 0 ? 'is-negative' : '' }),
                        fact('Arrears and interest', has(report.total_arrears) ? money(report.total_arrears) : '', { tone: arrears > 0 ? 'is-negative' : '' }),
                        fact('Operations', String(listOf(report.operations).filter(isRecord).length)),
                        fact('Holder code', report.holder_code ? `<span class="rk-mono">${esc(report.holder_code)}</span>` : ''),
                        fact('Identifier', report.identifier?.value ? `<span class="rk-mono">${esc(report.identifier.value)}</span>` : ''),
                    ])}
                </div>
            </section>`;
    }

    function renderCirbe() {
        const registry = data().credit?.registry;
        const report = Array.isArray(registry) ? registry.find(isRecord) : isRecord(registry) ? registry : null;
        if (!report) return cirbeUnavailable();
        const operations = listOf(report.operations).filter(isRecord);
        index('espaOperations', operations, op => [op.entity_name, op.entity_code, cirbe(CIRBE_PRODUCT, op.product_type, op.product_type_code), cirbe(CIRBE_ROLE, op.intervention_nature, op.intervention_nature_code), cirbe(CIRBE_MATURITY, op.maturity_type, op.maturity_type_code), op.operation_code, ...R.spellings(op.total_drawn), ...R.spellings(op.risk_available)].filter(Boolean).join(' '));
        // the operations entity by entity, in the order the report lists them
        const entities = [];
        operations.forEach((op, i) => {
            const key = `${op.entity_code || ''}|${op.entity_name || ''}`;
            let group = entities.find(g => g.key === key);
            if (!group) entities.push(group = { key, name: op.entity_name, code: op.entity_code, ops: [] });
            group.ops.push({ op, i });
        });
        const minor = listOf(report.minor_risks).filter(isRecord);
        const aggregated = report.sub_family === 'credit_registry_data:es_cirbe_aggregated';
        return page('credit_registry',
            safely(cirbeHero, [report], () => broken('The report')),
            section('fa-solid fa-list-check', 'Operations', `<span id="espaOperationsCount">${operations.length}</span>`,
                operations.length ? `<div id="espaOperations" class="rk-stack">${entities.map(group => `
                    <div class="rk-stack" data-search-group>
                        <div class="espa-group"><span class="espa-bank"><i class="fa-solid fa-building-columns"></i></span><b>${esc(aggregated ? 'All entities' : group.name || 'Declaring entity')}</b>${group.code ? `<small class="rk-mono">${esc(group.code)}</small>` : ''}<small>${plural(group.ops.length, 'operation', 'operations')}</small><span class="espa-group-rule"></span></div>
                        <div class="rk-table-card"><table class="rk-table espa-ops">
                            <thead><tr><th>Operation</th><th class="text-right">Drawn</th><th class="text-right">Available</th><th class="text-right">Overdue</th><th class="text-right">Arrears</th></tr></thead>
                            <tbody>${group.ops.map(({ op, i }) => safely(operationRow, [op, i], () => `<tr data-i="${i}"><td colspan="5">${broken('An operation')}</td></tr>`)).join('')}</tbody>
                        </table></div>
                    </div>`).join('')}${searchNone('No operation matches the search.')}</div>`
                    : empty('fa-solid fa-list-check', 'No operations', 'The report lists no active risk operation.'),
                operations.length > 4 ? searchBox({ target: 'espaOperations', placeholder: 'Search operations', label: 'Search the operations', title: 'Entity, product, role, maturity, operation code or amount — every word must match; quotes keep a phrase together' }) : ''),
            minor.length ? section('fa-solid fa-circle-info', 'Minor risks', minor.length, `
                <p class="rk-muted">Entities whose total risk with the person is under 9.000 €: the report names them without their operations.</p>
                <div class="rk-stack">${minor.map(risk => card({
                    title: risk.entity_name || 'Declaring entity',
                    sub: risk.entity_code ? `<span>Entity <span class="rk-mono">${esc(risk.entity_code)}</span></span>` : '',
                    main: has(risk.limit_amount) ? amount('Accumulation limit', money(risk.limit_amount)) : '',
                })).join('')}</div>`) : '');
    }

    /** While the Banco de España prepares the report: what is happening, and that the page will draw it. */
    const cirbePending = () => page('credit_registry', `
        <div class="rk-empty espa-pending">
            <span><i class="fa-solid fa-hourglass-half"></i></span>
            <b>The report is on its way</b>
            <p>The Banco de España is preparing the Central Credit Registry report. This view draws it as soon as the session receives it.</p>
            <small><i class="fa-solid fa-spinner fa-spin"></i> Waiting for the Banco de España</small>
        </div>`);

    // ---------------------------------------------------------------- education

    /** The year in a date the source gave: «2012». */
    const yearIn = (value) => (typeof value === 'string' && /^\d{4}/.test(value) ? value.slice(0, 4) : '');

    /**
     * A degree: on one side the year it was completed and its level, on the other what it is, where
     * it was earned and how it is registered. Its tags sit over its name; a name runs to two lines
     * rather than lose its end.
     */
    function degreeCard(degree) {
        const kind = (window.INFONITE_ENUMS?.ACADEMIC_DATA_TYPES || {})[degree.sub_family] || { label: 'Certification', icon: 'fa-certificate' };
        const status = String(degree.completion_status || 'unknown').replace(/_/g, ' ');
        const done = degree.completion_status === 'completed';
        const year = yearIn(degree.end_date) || yearIn(degree.issue_date);
        const number = (value) => (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? qty(value) : '');
        const registry = degree.official_id || degree.national_registry_id;
        const archive = [degree.archive_volume ? `Volume ${esc(degree.archive_volume)}` : '', degree.archive_entry ? `entry ${esc(degree.archive_entry)}` : ''].filter(Boolean).join(' · ');
        const where = [
            degree.region ? esc(degree.region) : '',
            degree.institution_country ? `<img class="espa-flag" src="${flagUrl(degree.institution_country)}" alt=""> ${esc(degree.institution_country)}` : '',
        ].filter(Boolean);
        return `
            <article class="rk-card espa-degree${done ? '' : ' is-open'}">
                <div class="espa-degree-mark" title="${esc(kind.label)}">
                    <span><i class="fa-solid ${esc(kind.icon)}"></i></span>
                    <b>${year || '—'}</b>
                    <small>${done ? 'Completed' : esc(status)}</small>
                </div>
                <div class="espa-degree-body">
                    <div class="rk-card-tags">${tag(esc(kind.label), 'is-quiet')}${done ? tag('<i class="fa-solid fa-circle-check"></i>&nbsp;completed', 'is-ok') : tag(esc(status), 'is-warn')}${degree.study_framework ? tag(`Plan ${esc(degree.study_framework)}`, 'is-quiet') : ''}</div>
                    <h3 class="espa-degree-title">${esc(degree.qualification_name || 'Qualification')}</h3>
                    <p class="espa-degree-school"><i class="fa-solid fa-building-columns"></i><b>${esc(degree.institution_name || 'Unknown institution')}</b>${where.map(part => `<span>${part}</span>`).join('')}${degree.institution_code ? `<em class="rk-mono" title="Institution code">${esc(degree.institution_code)}</em>` : ''}</p>
                    ${facts([
                        fact('Started', degree.start_date ? day(degree.start_date) : ''),
                        fact('Completed', degree.end_date ? day(degree.end_date) : ''),
                        fact('Issued', degree.issue_date ? day(degree.issue_date) : ''),
                        fact('Field', degree.field_of_study ? esc(degree.field_of_study) : ''),
                        fact('Credits', number(degree.total_credits)),
                        fact('Grade average', number(degree.grade_average)),
                        fact('Registration', registry ? `<span class="rk-mono">${esc(registry)}</span>` : '', { sub: degree.regional_registry_id ? `Regional <span class="rk-mono">${esc(degree.regional_registry_id)}</span>` : '' }),
                        fact('Archive', archive),
                    ])}
                </div>
            </article>`;
    }

    function renderAcademic() {
        const academic = isRecord(data().academic) ? data().academic : {};
        const higher = listOf(academic.higher_education_degrees).filter(isRecord);
        const secondary = listOf(academic.secondary_education).filter(isRecord);
        if (!higher.length && !secondary.length) return page('academic', empty(VIEWS.academic.icon, 'No certifications', 'No official degree or certificate is on record for this person.'));
        const cards = (list) => `<div class="rk-stack">${list.map(degree => safely(degreeCard, [degree], () => broken(degree.qualification_name || 'A degree'))).join('')}</div>`;
        return page('academic',
            higher.length ? section('fa-solid fa-award', 'Higher education', higher.length, cards(higher)) : '',
            secondary.length ? section('fa-solid fa-school', 'Secondary and vocational', secondary.length, cards(secondary)) : '');
    }

    // ---------------------------------------------------------------- properties

    /** What a property is used for, as an icon: parking, storage, a home, a shop, industry or land. */
    function propertyIcon(use) {
        const text = String(use || '').toUpperCase();
        if (/ESTACIONAMIENTO|GARAJE|APARCAMIENTO/.test(text)) return 'fa-square-parking';
        if (/ALMAC/.test(text)) return 'fa-warehouse';
        if (/RESIDENCIAL|VIVIENDA/.test(text)) return 'fa-house';
        if (/COMERCIAL|OFICINA/.test(text)) return 'fa-shop';
        if (/INDUSTRIAL/.test(text)) return 'fa-industry';
        if (/AGRARIO|AGRICOLA|AGRÍCOLA|RUSTICO|RÚSTICO/.test(text)) return 'fa-seedling';
        return 'fa-building';
    }

    /** How an assessed value splits into land and construction: a ring, never a bar — it is a composition, not progress. */
    function splitRing(part) {
        const land = Math.max(0, Math.min(100, part * 100));
        return `
            <svg class="espa-ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle class="espa-ring-build" cx="18" cy="18" r="15.9155"></circle>
                <circle class="espa-ring-land" cx="18" cy="18" r="15.9155" stroke-dasharray="${land.toFixed(2)} ${(100 - land).toFixed(2)}" stroke-dashoffset="25"></circle>
            </svg>`;
    }

    /** The cadastral reference as the Catastro composes it — parcel, sheet, property, control — and a button that copies it. */
    function cadastre(reference) {
        const ref = String(reference);
        const groups = /^[0-9A-Z]{18,}$/i.test(ref) ? [ref.slice(0, 7), ref.slice(7, 14), ref.slice(14, 18), ref.slice(18)] : [ref];
        return `
            <div class="espa-cadastre">
                <span class="espa-cadastre-icon"><i class="fa-solid fa-map-location-dot"></i></span>
                <span class="espa-cadastre-text"><small>Cadastral reference</small><code>${groups.map(group => `<span>${esc(group)}</span>`).join('')}</code></span>
                <button type="button" class="espa-copy" data-copy="${esc(ref)}" onclick="event.stopPropagation(); ESPA.copy(this)" title="Copy the reference"><i class="fa-regular fa-copy"></i></button>
            </div>`;
    }

    /** The person's own documents, to tell them apart among a property's owners. */
    const personIds = () => listOf(data().customer?.profile?.identification_numbers).map(id => String(id?.value || '').toUpperCase()).filter(Boolean);

    /**
     * A property: what it is and where, its cadastral reference and its owners, a row each with its
     * share — the person's own marked; beside them its assessed value and how it splits into land and
     * construction.
     */
    function propertyCard(prop, index) {
        const land = has(prop.land_value) ? Number(prop.land_value.amount) : null;
        const building = has(prop.construction_value) ? Number(prop.construction_value.amount) : null;
        const split = land !== null && building !== null && land + building > 0 ? land / (land + building) : null;
        const owners = listOf(prop.owners).filter(isRecord);
        const mine = personIds();
        const uses = String(prop.property_use || '').split(',').map(part => part.trim()).filter(Boolean);
        const ownerRows = owners.map(owner => {
            const part = Number(owner.percentage);
            const known = owner.percentage !== null && owner.percentage !== undefined && owner.percentage !== '' && Number.isFinite(part);
            const isPerson = owner.identifier && mine.includes(String(owner.identifier).toUpperCase());
            return `
                <li class="espa-owner${isPerson ? ' is-person' : ''}">
                    <span class="rk-avatar sm">${esc(String(owner.name || '').trim().split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toUpperCase() || '?')}</span>
                    <span class="espa-owner-name"><b>${esc(owner.name || 'Unknown')}</b><span class="espa-owner-meta">${owner.identifier ? `<small class="rk-mono">${esc(owner.identifier)}</small>` : ''}${isPerson ? tag('the person', 'is-ok') : ''}</span></span>
                    <span class="espa-owner-share">${known ? share(part) : '—'}</span>
                </li>`;
        }).join('');
        return `
            <div data-i="${index}">
                <article class="rk-card espa-property">
                    <div class="espa-property-main">
                        <div class="rk-card-tags">${prop.property_type ? tag(esc(titleCase(prop.property_type))) : ''}${uses.map(use => tag(esc(titleCase(use)), 'is-quiet')).join('')}</div>
                        <div class="espa-property-head">
                            <span class="espa-property-icon"><i class="fa-solid ${propertyIcon(prop.property_use)}"></i></span>
                            <div class="min-w-0">
                                <h3 class="espa-property-title">${esc(prop.address || 'Unknown address')}</h3>
                                <p class="espa-property-where">${prop.country ? `<img class="espa-flag" src="${flagUrl(prop.country)}" alt=""> ${esc(prop.country)}` : ''}${prop.official_id ? ` · <span class="rk-mono">${esc(prop.official_id)}</span>` : ''}</p>
                            </div>
                        </div>
                        ${prop.cadastral_reference ? cadastre(prop.cadastral_reference) : ''}
                        ${owners.length ? `
                            <div class="espa-owners">
                                <span class="espa-owners-label">${plural(owners.length, 'Owner', 'Owners')}</span>
                                <ul>${ownerRows}</ul>
                            </div>` : ''}
                    </div>
                    <aside class="espa-property-value">
                        <span class="espa-value-label">Assessed value${prop.assessment_year ? ` · ${esc(prop.assessment_year)}` : ''}</span>
                        <b class="espa-value">${has(prop.assessed_value) ? money(prop.assessed_value) : '—'}</b>
                        ${split !== null ? `
                            <div class="espa-split">
                                ${splitRing(split)}
                                <ul>
                                    <li><i class="is-land"></i><span>Land</span><b>${money(prop.land_value)}</b><small>${share(split)}</small></li>
                                    <li><i class="is-build"></i><span>Construction</span><b>${money(prop.construction_value)}</b><small>${share(1 - split)}</small></li>
                                </ul>
                            </div>` : `
                            <ul class="espa-split-plain">
                                ${land !== null ? `<li><span>Land</span><b>${money(prop.land_value)}</b></li>` : ''}
                                ${building !== null ? `<li><span>Construction</span><b>${money(prop.construction_value)}</b></li>` : ''}
                            </ul>`}
                    </aside>
                </article>
            </div>`;
    }

    function propertyText(prop) {
        return [prop.address, prop.cadastral_reference, prop.official_id, prop.property_type, prop.property_use, prop.assessment_year,
            ...listOf(prop.owners).flatMap(owner => [owner?.name, owner?.identifier])].filter(Boolean).join(' ');
    }

    function renderProperties() {
        const families = isRecord(data().properties) ? Object.values(data().properties) : [];
        const entries = families.flatMap(list => listOf(list)).filter(isRecord);
        if (!entries.length) return page('properties', empty(VIEWS.properties.icon, 'No properties', 'No real estate is registered in the person\'s name.'));
        index('espaProperties', entries, propertyText);
        return page('properties', section('fa-solid fa-house', 'Properties', `<span id="espaPropertiesCount">${entries.length}</span>`,
            `<div class="rk-stack" id="espaProperties">${entries.map((prop, i) => safely(propertyCard, [prop, i], () => `<div data-i="${i}">${broken(prop.address || 'A property')}</div>`)).join('')}${searchNone('No property matches the search.')}</div>`,
            entries.length > 3 ? searchBox({ target: 'espaProperties', placeholder: 'Search properties', label: 'Search the properties', title: 'Address, cadastral reference, type, use or owner — every word must match; quotes keep a phrase together' }) : ''));
    }

    // ---------------------------------------------------------------- what the page calls

    const RENDERERS = { work_life: renderWorkLife, driver: renderDriver, taxes: renderTaxes, credit_registry: renderCirbe, academic: renderAcademic, properties: renderProperties };

    /** Draws a records view into the page's root; a view that cannot be drawn says so, never half drawn. */
    function render(view, root) {
        try {
            root.innerHTML = RENDERERS[view] ? RENDERERS[view]() : R.undrawn();
            if (view === 'driver') loadDriverPhoto();
        } catch (error) {
            console.warn(`Spain Public Administration: the ${view} view could not be drawn`, error);
            root.innerHTML = R.undrawn();
        }
    }

    function renderYearInto(key, root) {
        try {
            root.innerHTML = renderYear(key);
        } catch (error) {
            console.warn('Spain Public Administration: a tax return could not be drawn', error);
            root.innerHTML = R.undrawn();
        }
        root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    /** A view the session did not ask for. */
    const notRequested = (view) => (VIEWS[view] ? page(view, empty('fa-solid fa-lock', 'Not requested', 'The session was not created to read this module, so no administration was asked for it.')) : R.undrawn());
    /** A view of a session that ended before any record came. */
    const noData = (view) => (VIEWS[view] ? page(view, empty('fa-solid fa-ban', 'No data delivered', 'The session ended before this module delivered any record. Consent & Audit shows the consent and the connections made.')) : R.undrawn());

    /** Copies the value a button carries: its icon ticks once it is done, or crosses when the browser refused. */
    function copy(button) {
        const icon = button.querySelector('i');
        const show = (className) => {
            if (!icon) return;
            icon.className = className;
            setTimeout(() => { icon.className = 'fa-regular fa-copy'; }, 1800);
        };
        const writing = navigator.clipboard?.writeText(button.dataset.copy || '');
        (writing || Promise.reject(new Error('No clipboard'))).then(() => show('fa-solid fa-check'), () => show('fa-solid fa-xmark'));
    }

    window.ESPA = { render, renderYear: renderYearInto, tab, notRequested, noData, cirbePending, copy };
})();
