/**
 * session-launcher.js
 * Opening a session's widget from a flow's page, the same in every flow and on every page (its
 * sessions and its results): in a dialog only for a session that stays on its final screen
 * (`do_nothing`) — a redirect inside the dialog's iframe would carry the frame away, and the dialog
 * with it — and in a tab of its own otherwise. The dialog leaves the final screen in sight a moment
 * after the widget says it is done (`<flow>:ended`, from its own frame and nothing else on the page),
 * then closes and tells the page whether the session ended.
 *
 * A page mounts it once with its flow's event; the dialog is built the first time it is needed. It
 * also draws what a history row carries besides: the chips of what a session was created with, and
 * the buttons that copy an id or a link.
 */
(function () {
    'use strict';

    /** The flow the page mounted it for: the event its widget posts, and what to do once the dialog closes. */
    let flow = null;

    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

    /** Whether a session opens in the dialog: only one that stays on its final screen. */
    const opensInDialog = (settings) => settings?.completion_mode === 'do_nothing';

    /** The dialog, built the first time a session opens in it. */
    function dialog() {
        let modal = document.getElementById('widgetLauncher');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'widgetLauncher';
        modal.className = 'fixed inset-0 z-[400] hidden items-center justify-center glass-layout transition-opacity';
        modal.addEventListener('click', () => close());
        modal.innerHTML = `
  <div class="relative w-full md:max-w-[540px] h-full md:h-[750px] max-h-full md:max-h-[90vh] rounded-none md:rounded-3xl glass-halo mx-0 md:mx-4 overflow-hidden" onclick="event.stopPropagation()">
    <iframe id="widgetLauncherFrame" class="absolute inset-0 w-full h-full border-0 glass-frame-scaled" src="about:blank"></iframe>
  </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function launch(widgetUrl, settings) {
        if (!widgetUrl) return;
        if (!opensInDialog(settings)) {
            window.open(widgetUrl, '_blank', 'noopener');
            return;
        }
        const modal = dialog();
        if (window.glassHaloInk) glassHaloInk(modal.querySelector('.glass-halo'));
        document.getElementById('widgetLauncherFrame').src = widgetUrl;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    /** Closes the dialog; the page hears whether the widget had said it was done (`ended`). */
    function close(ended = false) {
        const modal = document.getElementById('widgetLauncher');
        if (!modal || modal.classList.contains('hidden')) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.getElementById('widgetLauncherFrame').src = 'about:blank';
        flow?.onClosed?.({ ended: ended === true });
    }

    /** How a launch opens, said beside its button. */
    const hint = (settings) => (opensInDialog(settings)
        ? 'Opens here, in a dialog: the session stays on its final screen.'
        : 'Opens in a new tab: the session redirects when it ends, and a dialog would lose it.');

    /**
     * Mounts the launcher for a flow: `event` is what its widget posts when it is done (`accept` reads
     * a message instead, for a flow that also hears an older one), and `onClosed({ ended })` what the
     * page does once the dialog closes.
     */
    function mount({ event, accept = null, onClosed }) {
        flow = { event, accept, onClosed };
        window.addEventListener('message', (message) => {
            const frame = document.getElementById('widgetLauncherFrame');
            if (!frame || message.source !== frame.contentWindow) return;
            if (!(flow.accept ? flow.accept(message.data) : message.data?.event === flow.event)) return;
            setTimeout(() => close(true), 2500);
        });
    }

    /** A chip of a history row. */
    const chip = (text, tone = 'bg-slate-100 text-slate-500 border-slate-200') =>
        `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${tone}">${text}</span>`;

    /** Where a URL lands, as a chip names it: its host. */
    function hostOf(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return '';
        }
    }

    /**
     * What a session was created with, as chips: sandbox first, then the flow's own (`own`, already
     * drawn with `chip`), then where it ends and whether it skipped the consent screen.
     */
    function chips(settings, own = []) {
        if (!settings) return '';
        const list = [];
        if (settings.sandbox) list.push(chip('<i class="fa-solid fa-code"></i> Sandbox', 'bg-amber-50 text-amber-700 border-amber-200'));
        list.push(...own);
        if (settings.completion_mode && settings.completion_mode !== 'do_nothing' && settings.completion_url) {
            const host = hostOf(settings.completion_url);
            const icon = /(^|\.)(wa\.me|whatsapp\.com)$/.test(host) ? 'fa-brands fa-whatsapp' : (host === 'infonite.dev' ? 'fa-solid fa-book-open' : 'fa-solid fa-diamond-turn-right');
            if (host) list.push(chip(`<i class="${icon}"></i> ${escapeHtml(host)}`));
        }
        if (settings.consent_level === 'none') list.push(chip('No consent screen'));
        return list.length ? `<div class="flex flex-wrap items-center gap-1 mt-1.5">${list.join('')}</div>` : '';
    }

    /**
     * A button that copies a value: the value travels escaped in an attribute, so a customer id with a
     * quote in it copies as it is; the icon ticks once it is done.
     */
    const copyButton = (value, title, className = 'text-[10px] text-slate-400 hover:text-[var(--primary)] transition-colors') =>
        `<button type="button" data-copy="${escapeHtml(value)}" onclick="InfoniteLauncher.copy(this)" class="${className}" title="${escapeHtml(title)}"><i class="fa-regular fa-copy"></i></button>`;

    function copy(button) {
        navigator.clipboard?.writeText(button.dataset.copy || '');
        const icon = button.querySelector('i');
        if (!icon) return;
        icon.className = 'fa-solid fa-check text-green-500';
        setTimeout(() => { icon.className = 'fa-regular fa-copy'; }, 2000);
    }

    window.InfoniteLauncher = { mount, launch, close, hint, opensInDialog, chip, chips, copyButton, copy };
})();
