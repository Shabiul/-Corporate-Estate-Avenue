// Services dropdown (click to open) for every page; hamburger menu for sub-pages.
// The home page's hamburger, scroll spy and the rest live in script.js.
(function () {
    var dropdown = document.getElementById('js-nav-dropdown');
    var toggle = document.getElementById('link-services');

    function setOpen(open) {
        if (!dropdown || !toggle) return;
        dropdown.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (dropdown && toggle) {
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(!dropdown.classList.contains('open'));
        });
        document.addEventListener('click', function (e) {
            if (!dropdown.contains(e.target)) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                setOpen(false);
                toggle.focus();
            }
        });
        dropdown.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { setOpen(false); });
        });
    }

    if (document.body.dataset.subpage) {
        var btn = document.getElementById('js-nav-toggle');
        var menu = document.getElementById('js-nav-menu');
        if (btn && menu) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var opening = !menu.classList.contains('open');
                menu.classList.toggle('open', opening);
                btn.classList.toggle('active', opening);
                document.body.style.overflow = opening ? 'hidden' : '';
                if (!opening) setOpen(false);
            });
            menu.querySelectorAll('a').forEach(function (a) {
                a.addEventListener('click', function () {
                    menu.classList.remove('open');
                    btn.classList.remove('active');
                    document.body.style.overflow = '';
                });
            });
        }
    }
})();
