/**
 * es-public-administration-presets.js
 * Product presets of the Spain Public Administration demo: the SAME flow, presented as another
 * product by forcing its configuration. Picked by `?preset=<name>`; without it, the pages are the
 * flow itself, exactly as before. Each preset keeps its own session history, so the product feels
 * like one of its own.
 */
(function () {
    const STEERING_WHEEL = '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M3.4 10.2 9.6 11.4M14.4 11.4l6.2-1.2M12 14.5V21"/></svg>';

    const PRESETS = {
        driver: {
            title: 'Spanish Driver Information',
            subtitle: 'The complete DGT driver profile: licences, points and vehicles',
            icon: STEERING_WHEEL,
            // Exactly what takes the DGT's own connection in the flow: the DGT products and the profile
            modules: ['customer_information_read', 'driver_data', 'vehicles_data'],
            moduleDescriptions: {
                customer_information_read: 'Name, document, address and contact details',
                driver_data: 'Licences and their validity, points balance and photograph',
                vehicles_data: 'Every registered vehicle, with inspection, insurance and incidents',
            },
            modulesTitle: 'Included Data',
            modulesSubtitle: 'Every session of this product reads all of it',
            categories: ['customer', 'driver'],
        },
    };

    const name = new URLSearchParams(window.location.search).get('preset');
    const preset = PRESETS[name] ? {name, ...PRESETS[name]} : null;

    window.ES_PA_PRESET = preset;
    window.ES_PA_HISTORY_CONTEXT = preset ? `es-public-administration:${preset.name}` : 'es-public-administration';
    window.esPaPresetQuery = (prefix = '&') => (preset ? `${prefix}preset=${preset.name}` : '');

    // Titles, subtitles, icons and links marked in the pages take the preset's
    document.addEventListener('DOMContentLoaded', () => {
        if (!preset) return;
        document.title = document.title.replace('Spain Public Administration', preset.title);
        document.querySelectorAll('[data-preset-title]').forEach(el => { el.textContent = preset.title; });
        document.querySelectorAll('[data-preset-subtitle]').forEach(el => { el.textContent = preset.subtitle; });
        document.querySelectorAll('[data-preset-icon]').forEach(el => { el.innerHTML = preset.icon; });
        document.querySelectorAll('[data-preset-link]').forEach(el => {
            el.href += (el.href.includes('?') ? '&' : '?') + `preset=${preset.name}`;
            if (el.title) el.title = el.title.replace('Spain Public Administration', preset.title);
        });
    });
})();
