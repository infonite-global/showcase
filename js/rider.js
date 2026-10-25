/**
 * rider.js
 * THE WORD THAT RIDES. The product is Financial RIDER, not Reader, and its name says so: on arrival
 * it reads "Reader" for a beat, then rides into "Rider", the jockey coming out from behind its last
 * letter; hovering shows the word it is NOT, and leaving brings the rider back. Every element marked
 * `data-rider` that holds the word's markup wears it (css/rider.css).
 */
(function () {
    function mount(host) {
        const slot = host.querySelector('.rider-slot');
        const glyphs = {
            rider: host.querySelector('.rider-glyph-rider'),
            reader: host.querySelector('.rider-glyph-reader'),
        };
        if (!slot || !glyphs.rider || !glyphs.reader) return;

        // The slot is the one letter that differs: "i" against "ea". Its width is measured so the
        // word can slide between the two instead of jumping.
        const fit = (which) => { slot.style.width = glyphs[which].getBoundingClientRect().width + 'px'; };
        const show = (which) => { host.classList.toggle('is-reader', which === 'reader'); fit(which); };

        // Riding out: the jockey comes from behind the "r", raising dust, and the word flashes
        let riding = null;
        const ride = () => {
            host.classList.remove('is-riding');
            void host.offsetWidth;  // restart the animations
            host.classList.add('is-riding');
            show('rider');
            clearTimeout(riding);
            riding = setTimeout(() => host.classList.remove('is-riding'), 1300);
        };

        show('reader');
        setTimeout(ride, 1100);

        host.addEventListener('mouseenter', () => { clearTimeout(riding); host.classList.remove('is-riding'); show('reader'); });
        host.addEventListener('mouseleave', ride);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => fit(host.classList.contains('is-reader') ? 'reader' : 'rider'));
        }
    }

    window.InfoniteRider = { mount };
    document.querySelectorAll('[data-rider]').forEach(mount);
})();
