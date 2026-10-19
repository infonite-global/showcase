/**
 * The showcase's reading of an application's theme — the widget's own rules, so what this
 * demo paints around a widget is what the widget paints inside it. Pure: a stored config in,
 * colours and a scene out. Nothing here touches the DOM.
 *
 * Three rules are byte-ported from `ux-infonite-flow` and must stay in step with it:
 *   - `contrastGround`: the ground under the cards while the contrast mode is on — the app's
 *     colour toned to a pale pastel (light) or a deep shade (dark), or the house grey.
 *   - `soundSpecialScreen`: a special-screen theme is worn only when it can be read whole;
 *     anything else applies nowhere, as if `enabled` were `none`.
 *   - the ground scene: `solid` is the two colours top to bottom; `translucent` is two soft
 *     lights of the two colours drifting under a frosted veil of the ground.
 */
(function () {
    const HEX = /^#([0-9a-fA-F]{3}){1,2}$/;
    const HOUSE_CONTRAST_GROUND = { light: '#F4F6F8', dark: '#141A21' };
    // the schemes' own grounds without the contrast mode: paper white, and the widget's grey 900
    const SCHEME_GROUND = { light: '#FFFFFF', dark: '#141A21' };
    const SCHEME_INK = { light: '#1C252E', dark: '#FFFFFF' };
    const HOUSE = { primary: '#00a76f', dark: '#1C252E' };
    const ENABLED = ['none', 'mobile', 'desktop', 'both'];
    const STYLES = ['solid', 'translucent'];

    const isRecord = (value) => typeof value === 'object' && value !== null;
    const isHex = (value) => typeof value === 'string' && HEX.test(value);

    const expand = (hex) => {
        const value = hex.replace('#', '');
        return value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    };

    function hexToRgb(hex) {
        const full = expand(hex);
        return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    }

    /** `"r g b"`, the form a `rgb(var(--x) / a)` expects. */
    function hexToChannel(hex) {
        return hexToRgb(hex).join(' ');
    }

    function hexToHsl(hex) {
        const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h = 0;
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return [h / 6, s, l];
    }

    function hslToHex(h, s, l) {
        const hue = (p, q, t) => {
            let x = t;
            if (x < 0) x += 1;
            if (x > 1) x -= 1;
            if (x < 1 / 6) return p + (q - p) * 6 * x;
            if (x < 1 / 2) return q;
            if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
            return p;
        };
        let r = l;
        let g = l;
        let b = l;
        if (s !== 0) {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue(p, q, h + 1 / 3);
            g = hue(p, q, h);
            b = hue(p, q, h - 1 / 3);
        }
        const channel = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
        return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
    }

    /** The ground the widget paints under the cards while the contrast mode is on, for `mode`. */
    function contrastGround(colour, mode) {
        if (!colour || !HEX.test(colour)) return HOUSE_CONTRAST_GROUND[mode];
        const [h, s] = hexToHsl(colour);
        return mode === 'light' ? hslToHex(h, Math.min(s, 0.35), 0.965) : hslToHex(h, Math.min(s, 0.3), 0.104);
    }

    /** White or black, whichever reads on `hex` — the core's own rule for a missing ink. */
    function inkFor(hex) {
        const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
        return 0.299 * r + 0.587 * g + 0.114 * b <= 0.5 ? '#FFFFFF' : '#000000';
    }

    /** A colour set with a paintable main; shades it lacks are the main, the ink it lacks is by the main's lightness. */
    function soundColourSet(value) {
        if (!isRecord(value) || !isHex(value.main)) return null;
        const main = value.main.toUpperCase();
        const shade = (key) => (isHex(value[key]) ? value[key].toUpperCase() : main);
        const ink = isHex(value.contrast_text) ? value.contrast_text : isHex(value.contrastText) ? value.contrastText : null;
        return {
            lighter: shade('lighter'),
            light: shade('light'),
            main,
            dark: shade('dark'),
            darker: shade('darker'),
            contrastText: ink || inkFor(main),
        };
    }

    /** The special-screen theme as it may be worn, or `null` when it cannot be worn at all. */
    function soundSpecialScreen(value) {
        if (!isRecord(value)) return null;
        if (typeof value.enabled !== 'string' || !ENABLED.includes(value.enabled)) return null;
        const mode = value.theme_mode === 'dark' ? 'dark' : value.theme_mode === 'light' ? 'light' : null;
        if (!mode) return null;
        const primary = soundColourSet(value.color_primary);
        const secondary = soundColourSet(value.color_secondary);
        const c1 = soundColourSet(value.gradient_color_1);
        const c2 = soundColourSet(value.gradient_color_2);
        if (!primary || !secondary || !c1 || !c2) return null;
        return {
            enabled: value.enabled,
            theme_mode: mode,
            contrast_mode: value.contrast_mode === true,
            color_primary: primary,
            color_secondary: secondary,
            gradient_style: STYLES.includes(value.gradient_style) ? value.gradient_style : 'solid',
            gradient_color_1: c1,
            gradient_color_2: c2,
        };
    }

    /** Whether the special screen's theme applies on THIS device: `mobile` is under the widget's `md` breakpoint. */
    function appliesOn(enabled, isMobile) {
        if (!enabled || enabled === 'none') return false;
        if (enabled === 'both') return true;
        return isMobile ? enabled === 'mobile' : enabled === 'desktop';
    }

    /** The widget's `md` breakpoint: under it the device counts as a phone. */
    const MOBILE_QUERY = '(max-width: 899.95px)';
    const isMobile = () => (typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY).matches : false);

    /** The scheme's ground with the app's contrast settings in: toned while the contrast mode is on, plain otherwise. */
    function schemeGround(settings, mode, contrast) {
        return contrast ? contrastGround(settings && settings.contrast_color, mode) : SCHEME_GROUND[mode];
    }

    /**
     * Everything the showcase paints from a stored config, resolved once:
     *   - `page`: the ground under the page's content — the app's light-scheme ground, with its
     *     contrast settings in. The showcase is a light site, so an app's dark scheme is worn
     *     by the hero and not by the page around it.
     *   - `hero`: the scene the hero wears, where it comes from (`special_screen`, `app` or
     *     `house`), and the ink that reads over it. A sound special screen that applies on this
     *     device wins; a synced app without one wears the dark scheme (the one that stands
     *     out from this light page), flat, with the logo drawn for it; no app at all wears
     *     the house look. `logoScheme` names
     *     the logo that reads over the scene.
     */
    function resolve(config) {
        // the settings synced last: kept while the service is unreachable, so the page goes on
        // looking like the app it is waiting for (the connectivity is said elsewhere, loudly)
        const settings = config && isRecord(config.app_settings) ? config.app_settings : null;
        const appPrimary = settings && soundColourSet(settings.color_primary);
        const appSecondary = settings && soundColourSet(settings.color_secondary);
        const appContrast = !!(settings && settings.contrast_mode === true);
        const appMode = settings && settings.theme_mode === 'dark' ? 'dark' : 'light';

        const page = { ground: settings ? schemeGround(settings, 'light', appContrast) : HOUSE_CONTRAST_GROUND.light };

        let hero;
        const special = settings && soundSpecialScreen(settings.special_screen);
        if (special && appliesOn(special.enabled, isMobile())) {
            const mode = special.theme_mode;
            hero = {
                source: 'special_screen',
                mode,
                style: special.gradient_style,
                c1: special.gradient_color_1.main,
                c2: special.gradient_color_2.main,
                ground: schemeGround(settings, mode, special.contrast_mode),
                // a solid run is read over its first colour; a translucent scene keeps the
                // ground's colour as the one that reads, so its ink is the scheme's
                ink: special.gradient_style === 'solid' ? special.gradient_color_1.contrastText : SCHEME_INK[mode],
                inkFoot: special.gradient_style === 'solid' ? special.gradient_color_2.contrastText : SCHEME_INK[mode],
                primary: special.color_primary.main,
                primaryInk: special.color_primary.contrastText,
            };
            // the logo is the one drawn for the ground it sits on: the scheme's over a
            // translucent scene, and over a solid run the one whose ink matches the run's
            hero.logoScheme = special.gradient_style === 'solid' ? (hero.ink.toUpperCase() === '#FFFFFF' ? 'dark' : 'light') : mode;
        } else if (settings && appPrimary) {
            // No special screen for this device: nothing is invented — no gradient a person
            // never reviewed. The hero wears the DARK scheme, flat, with the app's dark-scheme
            // logo on it: this demo's page is always light, so what stands out from it is the
            // dark ground, whatever scheme the app itself runs in.
            const opposite = 'dark';
            const ground = schemeGround(settings, opposite, appContrast);
            hero = {
                source: 'app',
                mode: opposite,
                style: 'flat',
                c1: ground,
                c2: ground,
                ground,
                ink: SCHEME_INK[opposite],
                inkFoot: SCHEME_INK[opposite],
                primary: appPrimary.main,
                primaryInk: appPrimary.contrastText,
                logoScheme: opposite,
            };
        } else {
            // the house look: the brand green as one light on the brand dark
            hero = {
                source: 'house',
                mode: 'dark',
                style: 'translucent',
                c1: HOUSE.primary,
                c2: HOUSE.dark,
                ground: HOUSE.dark,
                ink: SCHEME_INK.dark,
                inkFoot: SCHEME_INK.dark,
                primary: HOUSE.primary,
                primaryInk: '#FFFFFF',
                logoScheme: 'dark',
            };
        }

        return {
            page,
            hero,
            app: settings,
            // the app's own scheme, which the navigation wears when no special screen says otherwise
            appMode: settings ? appMode : 'dark',
            // the app's main action with the ink that reads on it — the one pair of colours an
            // app sends that is safe to paint as is (the house pair without an app)
            primary: appPrimary ? { main: appPrimary.main, ink: appPrimary.contrastText } : { main: HOUSE.primary, ink: '#FFFFFF' },
            logoVariant: settings && settings.logo_variant === 'square' ? 'square' : 'rectangle',
        };
    }

    /**
     * What the navigation bar wears over a surface — `hero` on the home page, `page` elsewhere.
     * The bar never takes an app colour as its ground: it is a sheet of glass over whatever is
     * below, in that surface's scheme, so no colour an app picks can make it unreadable. Over
     * the hero the glass is the scene's ground thinned out and its ink; over the page it is
     * white and the house ink. Over the hero the scheme is the special screen's when one is
     * worn and the app's own otherwise. The only app colour on it is the primary, always with
     * the ink the app sent for it, on the active link.
     */
    function nav(theme, over) {
        const onHero = over === 'hero';
        // over the hero: the special screen's scheme when one is worn, the app's own otherwise
        // (the flat hero is always dark, but the bar belongs to the app, not to the hero)
        const scheme = !onHero ? 'light' : theme.hero.source === 'special_screen' ? theme.hero.logoScheme : theme.appMode;
        const ground = onHero ? (scheme === theme.hero.mode ? theme.hero.ground : SCHEME_GROUND[scheme]) : '#FFFFFF';
        const ink = SCHEME_INK[scheme];
        const primary = onHero ? { main: theme.hero.primary, ink: theme.hero.primaryInk } : theme.primary;
        return { scheme, ground, ink, primary, logoScheme: scheme };
    }

    window.InfoniteTheme = {
        HOUSE_CONTRAST_GROUND,
        SCHEME_GROUND,
        SCHEME_INK,
        MOBILE_QUERY,
        hexToChannel,
        contrastGround,
        inkFor,
        soundColourSet,
        soundSpecialScreen,
        appliesOn,
        resolve,
        nav,
    };
})();
