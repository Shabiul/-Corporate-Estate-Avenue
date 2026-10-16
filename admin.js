(() => {
    'use strict';

    // ------------------------------------------------------------------ constants
    const STAGES = [
        ['new', 'New'], ['contacted', 'Contacted'], ['visit', 'Site visit'],
        ['negotiating', 'Negotiating'], ['won', 'Won'], ['lost', 'Lost'],
    ];
    const STAGE_LABEL = Object.fromEntries(STAGES);
    const SOURCES = [['website', 'Website'], ['phone', 'Phone call'], ['whatsapp', 'WhatsApp'], ['walk-in', 'Walk-in'], ['referral', 'Referral'], ['other', 'Other']];
    const SOURCE_LABEL = Object.fromEntries(SOURCES);
    const LISTING_STATUS = [['pending', 'Pending approval'], ['approved', 'Live on site'], ['rejected', 'Rejected'], ['all', 'All']];
    const SERVICE_LABEL = {
        pm: 'Property management', res: 'Residential consulting', comm: 'Commercial services', reloc: 'Corporate relocation',
        owner: 'Owner representation', client: 'Client representation', 'buyer-purchase': 'Buyer enquiry (buy)',
        'buyer-rent': 'Buyer enquiry (rent)', manual: 'Added manually',
    };
    const PROPERTY_TYPES = ['Luxury Apartment', 'Premium Villa', 'Independent House', 'Row House', 'Penthouse', 'Commercial Office', 'Retail Space', 'Plot / Land'];
    const ACTIVITY_KINDS = [['note', 'Note'], ['call', 'Call'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['visit', 'Site visit']];
    const KIND_LABEL = { note: 'Note', call: 'Call', whatsapp: 'WhatsApp', email: 'Email', visit: 'Visit', stage: 'Stage', system: 'System' };
    const TEMPLATES = [
        ['greet', 'Thank you for the enquiry', (e) => 'Hi ' + first(e) + ', thank you for your enquiry with Corporate Estate Avenue. I am Sajjad. Could we speak briefly about what you are looking for?'],
        ['shortlist', 'Shortlist ready', (e) => 'Hi ' + first(e) + ', I have a few properties that match your requirement' + locPhrase(e) + '. Shall I share the details?'],
        ['visit', 'Arrange a site visit', (e) => 'Hi ' + first(e) + ', would you like to visit the property this week? Please let me know a convenient day and time.'],
        ['follow', 'Follow-up', (e) => 'Hi ' + first(e) + ', just following up on your property requirement. Is there anything I can help with?'],
    ];
    const PAGE = 25;
    const DAY = 86400000;

    // ------------------------------------------------------------------ state
    let token = sessionStorage.getItem('cea_admin_token') || '';
    let enquiries = [];
    let listings = [];
    let activities = [];
    let actByInq = {};
    let dupes = {};
    let enqPage = 1;
    let enqView = 'list';
    try { enqView = localStorage.getItem('cea_enq_view') === 'board' ? 'board' : 'list'; } catch (e) { /* storage blocked */ }
    let selectedEnq = new Set();
    let selectedLst = new Set();
    let listingStatus = 'pending';
    let listingStatusChosen = false;
    let lightbox = { images: [], i: 0 };

    // ------------------------------------------------------------------ helpers
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
    const digits = (p) => String(p || '').replace(/\D/g, '');
    const waLink = (phone, text) => { let d = digits(phone); if (d.length === 10) d = '91' + d; return d ? 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '') : ''; };
    const safeUrl = (u) => (typeof u === 'string' && /^(https:\/\/|\/uploads\/)/.test(u)) ? u : '';
    const first = (e) => (String(e.name || '').trim().split(/\s+/)[0] || 'there');
    const IC = {
        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
        mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    };

    let toastTimer;
    function toast(msg) {
        const t = $('js-toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }

    async function api(path, opts = {}) {
        const headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opts.headers || {});
        let body = opts.body;
        if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
        const res = await fetch(path, { method: opts.method || 'GET', headers, body });
        if (res.status === 401) { signOut('Your session expired. Please sign in again.'); throw new Error('unauthorised'); }
        let data = null;
        try { data = await res.json(); } catch (e) { /* non-JSON */ }
        if (!res.ok || !data || data.success === false) throw new Error((data && data.message) || 'Something went wrong.');
        return data;
    }
    const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.message !== 'unauthorised') toast(e.message); } };

    // ------------------------------------------------------------------ enquiry intelligence
    function parseDetails(msg) {
        const out = {};
        String(msg || '').split('\n').forEach((line) => {
            const i = line.indexOf(':');
            if (i > 0 && i < 40) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        });
        return out;
    }
    const isBlank = (v) => !v || /^(not specified|none)$/i.test(v);
    const enquiryType = (e) => e.service === 'buyer-purchase' ? 'purchase' : (e.service === 'buyer-rent' ? 'rent' : 'other');
    const isClosed = (e) => e.status === 'won' || e.status === 'lost';
    const isDue = (e) => e.follow_up_on && e.follow_up_on <= todayStr() && !isClosed(e);
    function lookingFor(e) {
        const d = parseDetails(e.message);
        if (d['Property enquiry for']) {
            return [d['Property enquiry for'] === 'Rent' ? 'Rent' : 'Buy', d['Preferred property type'], d['Preferred configuration'], d['Preferred location / area'], d['Approximate budget']].filter((x) => !isBlank(x)).join(' · ');
        }
        const label = SERVICE_LABEL[e.service] || e.service || 'General enquiry';
        const m = String(e.message || '').replace(/\s+/g, ' ').trim();
        return m ? label + ': ' + (m.length > 70 ? m.slice(0, 70) + '…' : m) : label;
    }
    function locPhrase(e) { const l = parseDetails(e.message)['Preferred location / area']; return isBlank(l) ? '' : ' in ' + l; }

    // "80k", "1.2 L", "4 Cr", "85,000" -> rupees (or null when unclear)
    function parseMoney(t) {
        if (!t) return null;
        const s = String(t).toLowerCase().replace(/[₹,]/g, '').replace(/\brs\.?/g, '');
        const m = s.match(/(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|k)?\b/);
        if (!m) return null;
        let n = parseFloat(m[1]);
        const u = m[2];
        if (u) n *= /^cr/.test(u) ? 1e7 : /^(l|lac|lakh)/.test(u) ? 1e5 : 1e3;
        else if (n < 1000) return null;
        return n;
    }
    const catOf = (t) => { t = String(t || '').toLowerCase(); return /apartment|flat/.test(t) ? 'flat' : /penthouse/.test(t) ? 'penthouse' : /villa/.test(t) ? 'villa' : /row/.test(t) ? 'row' : /plot|land/.test(t) ? 'plot' : /commercial|office|retail/.test(t) ? 'commercial' : /house/.test(t) ? 'house' : 'other'; };
    const ENQ_CAT = { 'Flat': 'flat', 'Penthouse': 'penthouse', 'Villa': 'villa', 'Independent House': 'house', 'Row House': 'row', 'Plot / Land': 'plot' };
    const bhkNum = (t) => { const m = String(t || '').match(/(\d+)\s*bhk/i); return m ? Number(m[1]) : null; };

    function requirement(e) {
        const d = parseDetails(e.message);
        const types = isBlank(d['Preferred property type']) ? [] : d['Preferred property type'].split(',').map((x) => ENQ_CAT[x.trim()]).filter(Boolean);
        const cfg = isBlank(d['Preferred configuration']) ? [] : d['Preferred configuration'].split(',').map((x) => x.trim());
        const beds = cfg.map((c) => ({ n: bhkNum(c), up: /above/i.test(c) })).filter((c) => c.n);
        const loc = isBlank(d['Preferred location / area']) ? [] : d['Preferred location / area'].toLowerCase().split(/[,\/&]|\band\b/).map((x) => x.trim()).filter((x) => x.length >= 3);
        const budget = isBlank(d['Approximate budget']) ? null : parseMoney(d['Approximate budget']);
        const purpose = enquiryType(e);
        return { types, beds, loc, budget, purpose, specific: !!(types.length || beds.length || loc.length || budget) };
    }
    function matchScore(e, l, req) {
        const isRentListing = l.listing_type === 'Rent' || l.listing_type === 'Lease';
        if (req.purpose === 'purchase' && isRentListing) return 0;
        if (req.purpose === 'rent' && !isRentListing) return 0;
        let s = 20;
        if (req.types.length) { if (req.types.includes(catOf(l.property_type))) s += 30; } else s += 10;
        const lb = bhkNum(l.property_bhk);
        if (req.beds.length && lb) { if (req.beds.some((b) => b.up ? lb >= b.n : lb === b.n)) s += 25; } else if (!req.beds.length) s += 5;
        const ll = String(l.property_location || '').toLowerCase();
        const head = ll.split(',')[0].trim();
        if (req.loc.length && req.loc.some((x) => ll.includes(x) || (head.length >= 4 && x.includes(head)))) s += 25;
        const price = parseMoney(l.property_price);
        if (req.budget && price) { if (price <= req.budget) s += 20; else if (price <= req.budget * 1.1) s += 10; }
        return Math.min(100, s);
    }
    function matchesFor(e) {
        const req = requirement(e);
        return listings.filter((l) => l.status === 'approved')
            .map((l) => ({ l, s: matchScore(e, l, req) })).filter((m) => m.s >= (req.specific ? 45 : 20))
            .sort((a, b) => b.s - a.s).slice(0, 5);
    }
    function enquiriesFor(l) {
        return enquiries.filter((e) => !isClosed(e))
            .map((e) => ({ e, s: matchScore(e, l, requirement(e)) })).filter((m) => m.s >= 55)
            .sort((a, b) => b.s - a.s).slice(0, 6);
    }

    function lastTouch(e) {
        const acts = actByInq[e.id];
        return Math.max(new Date(e.created_at).getTime(), e.updated_at ? new Date(e.updated_at).getTime() : 0, acts && acts.length ? new Date(acts[0].created_at).getTime() : 0);
    }
    const isStale = (e) => !isClosed(e) && (Date.now() - lastTouch(e)) >= 3 * DAY;
    function priority(e) {
        if (isClosed(e)) return { label: 'closed', score: -1 };
        let s = 0;
        const age = (Date.now() - new Date(e.created_at).getTime()) / DAY;
        s += age < 1 ? 30 : age < 3 ? 20 : age < 7 ? 10 : 0;
        const d = parseDetails(e.message);
        if (e.phone) s += 10;
        if (!isBlank(d['Approximate budget'])) s += 15;
        if (!isBlank(d['Preferred location / area'])) s += 10;
        if (!isBlank(d['Preferred configuration'])) s += 5;
        s += { new: 15, contacted: 5, visit: 15, negotiating: 25 }[e.status] || 0;
        if (dupes[e.id] > 1) s += 10;
        if (isDue(e)) s += 10;
        return { label: s >= 60 ? 'hot' : s >= 35 ? 'warm' : 'cold', score: s };
    }
    const prioPill = (e) => { const p = priority(e); return '<span class="prio prio-' + p.label + '" title="Priority score ' + p.score + '">' + (p.label === 'closed' ? 'Closed' : p.label) + '</span>'; };
    function commission(e) {
        if (e.status !== 'won' || !e.deal_value || !e.deal_kind) return null;
        const fee = e.deal_kind === 'Rent' ? Number(e.deal_value) : Number(e.deal_value) * 0.02;
        return { fee, gst: fee * 0.18 };
    }

    function indexData() {
        actByInq = {};
        activities.forEach((a) => { (actByInq[a.inquiry_id] = actByInq[a.inquiry_id] || []).push(a); });
        const counts = {};
        const key = (e) => [digits(e.phone).slice(-10), String(e.email || '').toLowerCase()].filter((k) => k.length > 5);
        enquiries.forEach((e) => key(e).forEach((k) => { (counts[k] = counts[k] || new Set()).add(e.id); }));
        dupes = {};
        enquiries.forEach((e) => { const ids = new Set(); key(e).forEach((k) => counts[k].forEach((id) => ids.add(id))); dupes[e.id] = ids.size; });
    }

    // ------------------------------------------------------------------ auth
    function showApp() {
        $('js-login').hidden = !!token;
        $('js-app').hidden = !token;
        if (token) loadAll();
    }
    function signOut(msg) {
        sessionStorage.removeItem('cea_admin_token');
        token = '';
        enquiries = []; listings = []; activities = [];
        showApp();
        if (msg) toast(msg);
    }
    $('js-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('js-login-btn');
        btn.disabled = true; btn.textContent = 'Signing in...';
        $('js-login-error').style.display = 'none';
        try {
            const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.token) throw new Error(data.message || 'bad');
            token = data.token;
            sessionStorage.setItem('cea_admin_token', token);
            $('js-login-form').reset();
            showApp();
        } catch (err) {
            $('js-login-error').textContent = err.message && err.message !== 'bad' ? err.message : 'That username or password is not correct.';
            $('js-login-error').style.display = 'block';
        } finally {
            btn.disabled = false; btn.textContent = 'Sign in';
        }
    });
    $('js-logout').addEventListener('click', () => signOut('You have signed out.'));

    // ------------------------------------------------------------------ data loading
    const loadAll = guard(async () => {
        const [a, b, c] = await Promise.all([api('/api/admin/inquiries'), api('/api/admin/properties'), api('/api/admin/activities')]);
        enquiries = a.data || [];
        listings = b.data || [];
        activities = c.data || [];
        indexData();
        const known = new Set(enquiries.map((x) => x.id)); selectedEnq = new Set([...selectedEnq].filter((id) => known.has(id)));
        const knownL = new Set(listings.map((x) => x.id)); selectedLst = new Set([...selectedLst].filter((id) => knownL.has(id)));
        $('js-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        renderAll();
    });
    $('js-refresh').addEventListener('click', () => { loadAll(); toast('Refreshed.'); });
    setInterval(() => { if (token && !document.hidden && !$('js-overlay').classList.contains('open') && !$('js-palette').classList.contains('open')) loadAll(); }, 90000);

    function renderAll() {
        renderBadges();
        renderOverview();
        renderEnquiries();
        renderListings();
        renderAnalytics();
        renderSystemSession();
    }

    function renderBadges() {
        const n = enquiries.filter((e) => e.status === 'new').length;
        const p = listings.filter((l) => l.status === 'pending').length;
        $('js-badge-enq').textContent = n; $('js-badge-enq').hidden = n === 0;
        $('js-badge-list').textContent = p; $('js-badge-list').hidden = p === 0;
        document.title = (n + p > 0 ? '(' + (n + p) + ') ' : '') + 'CEA Portal | Admin Console';
    }

    // ------------------------------------------------------------------ tabs
    function goTab(name, filter) {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
        if (name === 'enquiries') {
            if (filter === 'due') { $('enq-due').checked = true; $('enq-status').value = ''; }
            else if (filter && STAGE_LABEL[filter]) { $('enq-status').value = filter; $('enq-due').checked = false; }
            else if (filter === 'all') { $('enq-status').value = ''; $('enq-due').checked = false; }
            enqPage = 1; renderEnquiries();
        }
        if (name === 'listings' && filter) { listingStatus = filter; listingStatusChosen = true; renderListings(); }
        window.scrollTo({ top: 0 });
    }
    $('js-tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) goTab(t.dataset.tab); });
    document.addEventListener('click', (e) => {
        const g = e.target.closest('[data-go]');
        if (g) { const [tab, f] = g.dataset.go.split(':'); goTab(tab, f); }
    });

    // ------------------------------------------------------------------ overview
    function renderOverview() {
        const newCount = enquiries.filter((e) => e.status === 'new').length;
        const due = enquiries.filter(isDue);
        const hot = enquiries.filter((e) => priority(e).label === 'hot');
        const pending = listings.filter((l) => l.status === 'pending');
        const live = listings.filter((l) => l.status === 'approved');
        const stale = enquiries.filter(isStale);
        const kpi = (label, num, go, alert) => '<button type="button" class="kpi' + (alert && num > 0 ? ' alert' : '') + '" data-go="' + go + '"><div class="label">' + label + '</div><div class="num">' + num + '</div></button>';
        $('js-kpis').innerHTML =
            kpi('New enquiries', newCount, 'enquiries:new', true) + kpi('Hot leads', hot.length, 'enquiries', true) + kpi('Follow-ups due', due.length, 'enquiries:due', true) +
            kpi('Gone quiet (3+ days)', stale.length, 'enquiries', true) + kpi('Awaiting approval', pending.length, 'listings:pending', true) + kpi('Live listings', live.length, 'listings:approved');
        $('js-pipeline').innerHTML = STAGES.map(([k, l]) => '<button type="button" class="stage" data-go="enquiries:' + k + '"><b class="st-' + k + '">' + enquiries.filter((e) => e.status === k).length + '</b><span>' + l + '</span></button>').join('');

        const row = (e, extra) => '<div class="mini"><div class="who"><strong>' + esc(e.name) + '</strong><span>' + esc(extra) + '</span></div><button class="btn btn-sm" data-open-enq="' + e.id + '" type="button">Open</button></div>';
        const todo = enquiries.filter((e) => isDue(e) || (isStale(e)) || priority(e).label === 'hot')
            .sort((a, b) => priority(b).score - priority(a).score).slice(0, 6);
        $('js-ov-due').innerHTML = todo.length ? todo.map((e) => row(e, (isDue(e) ? 'Follow-up due ' + e.follow_up_on : isStale(e) ? 'No activity for ' + Math.floor((Date.now() - lastTouch(e)) / DAY) + ' days' : 'Hot lead') + ' · ' + (e.phone || e.email))).join('') : '<p class="empty-note">You are all caught up. Hot leads, follow-ups and quiet leads show here.</p>';
        $('js-ov-latest').innerHTML = enquiries.length ? enquiries.slice(0, 6).map((e) => row(e, lookingFor(e))).join('') : '<p class="empty-note">No enquiries yet.</p>';
        $('js-ov-pending').innerHTML = pending.length ? pending.slice(0, 6).map((l) => '<div class="mini"><div class="who"><strong>' + esc(l.property_name) + '</strong><span>' + esc(l.listing_type || 'Sale') + ' · ' + esc(l.property_location) + '</span></div><div class="row-actions"><button class="btn btn-sm btn-ok" data-lstatus="approved" data-id="' + l.id + '" type="button">Approve</button><button class="btn btn-sm" data-edit-lst="' + l.id + '" type="button">Review</button></div></div>').join('') : '<p class="empty-note">No listings are waiting for approval.</p>';
    }

    // ------------------------------------------------------------------ enquiries (list + board)
    function fillSelect(sel, pairs) { const f = sel.options[0].outerHTML; sel.innerHTML = f + pairs.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join(''); }
    fillSelect($('enq-status'), STAGES);
    fillSelect($('enq-source'), SOURCES);
    fillSelect($('enq-bulk-status'), STAGES);

    function filteredEnquiries(ignoreStage) {
        const q = $('enq-q').value.trim().toLowerCase();
        const st = ignoreStage ? '' : $('enq-status').value, ty = $('enq-type').value, so = $('enq-source').value, dt = $('enq-date').value, due = $('enq-due').checked, sort = $('enq-sort').value;
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const rows = enquiries.filter((e) => {
            if (st && e.status !== st) return false;
            if (ty && enquiryType(e) !== ty) return false;
            if (so && (e.source || 'website') !== so) return false;
            if (due && !isDue(e)) return false;
            if (dt) { const t = new Date(e.created_at).getTime(); if (t < (dt === '1' ? startOfToday.getTime() : Date.now() - Number(dt) * DAY)) return false; }
            if (q && !(e.name + ' ' + e.email + ' ' + e.phone + ' ' + e.notes + ' ' + e.message + ' ' + (SERVICE_LABEL[e.service] || '')).toLowerCase().includes(q)) return false;
            return true;
        });
        rows.sort((a, b) => sort === 'old' ? new Date(a.created_at) - new Date(b.created_at)
            : sort === 'follow' ? (a.follow_up_on || '9999').localeCompare(b.follow_up_on || '9999')
            : sort === 'priority' ? priority(b).score - priority(a).score
            : new Date(b.created_at) - new Date(a.created_at));
        return rows;
    }

    const flagTags = (e) => (dupes[e.id] > 1 ? '<span class="tag tag-repeat" title="Same phone or email appears in ' + dupes[e.id] + ' enquiries">Repeat ×' + dupes[e.id] + '</span>' : '') + (isStale(e) ? '<span class="tag tag-stale" title="No activity for 3+ days">Quiet</span>' : '');

    function renderEnquiries() {
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === enqView));
        $('enq-board').hidden = enqView !== 'board';
        $('enq-table-wrap').hidden = enqView === 'board';
        if (enqView === 'board') { renderBoard(); return; }
        const rows = filteredEnquiries();
        const pages = Math.max(1, Math.ceil(rows.length / PAGE));
        if (enqPage > pages) enqPage = pages;
        const slice = rows.slice((enqPage - 1) * PAGE, enqPage * PAGE);
        $('enq-empty').hidden = rows.length > 0;
        $('enq-body').innerHTML = slice.map((e) => {
            const wa = waLink(e.phone);
            const c = commission(e);
            return '<tr>' +
                '<td><input type="checkbox" data-sel-enq="' + e.id + '"' + (selectedEnq.has(e.id) ? ' checked' : '') + ' aria-label="Select"></td>' +
                '<td><strong>' + esc(e.name) + '</strong> <span class="pill pill-src">' + esc(SOURCE_LABEL[e.source || 'website'] || e.source) + '</span>' + flagTags(e) +
                    '<span class="sub">' + (e.phone ? '<a class="plain" href="tel:' + esc(e.phone) + '">' + esc(e.phone) + '</a>' : '') + (e.phone && e.email ? ' · ' : '') + (e.email ? '<a class="plain" href="mailto:' + esc(e.email) + '">' + esc(e.email) + '</a>' : '') + '</span>' +
                    '<div class="contact-links">' + (e.phone ? '<a class="btn btn-sm btn-icon" href="tel:' + esc(e.phone) + '" title="Call">' + IC.phone + '</a>' : '') + (wa ? '<a class="btn btn-sm btn-icon" href="' + wa + '" target="_blank" rel="noopener" title="WhatsApp">' + IC.wa + '</a>' : '') + (e.email ? '<a class="btn btn-sm btn-icon" href="mailto:' + esc(e.email) + '" title="Email">' + IC.mail + '</a>' : '') + '</div></td>' +
                '<td style="max-width:300px">' + esc(lookingFor(e)) + (e.notes ? '<span class="sub">Note: ' + esc(e.notes.length > 60 ? e.notes.slice(0, 60) + '…' : e.notes) + '</span>' : '') + (c ? '<span class="sub" style="color:var(--ok)">Commission ' + esc(money(c.fee)) + ' + GST</span>' : '') + '</td>' +
                '<td>' + prioPill(e) + '</td>' +
                '<td><select class="status-select st-' + esc(e.status) + '" data-stage="' + e.id + '" aria-label="Stage">' + STAGES.map(([k, l]) => '<option value="' + k + '"' + (e.status === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td>' +
                '<td>' + (e.follow_up_on ? '<span class="' + (isDue(e) ? 'due' : '') + '">' + esc(e.follow_up_on) + (isDue(e) ? ' (due)' : '') + '</span>' : '<span class="sub">-</span>') + '</td>' +
                '<td>' + esc(fmtDate(e.created_at)) + '<span class="sub">' + esc(new Date(e.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })) + '</span></td>' +
                '<td><div class="row-actions"><button class="btn btn-sm" data-open-enq="' + e.id + '" type="button">Open</button><button class="btn btn-sm btn-danger" data-del-enq="' + e.id + '" type="button">Delete</button></div></td></tr>';
        }).join('');
        $('enq-pager').innerHTML = '<span>' + rows.length + ' enquir' + (rows.length === 1 ? 'y' : 'ies') + (rows.length !== enquiries.length ? ' (of ' + enquiries.length + ')' : '') + '</span>' +
            (pages > 1 ? '<span><button class="btn btn-sm" data-page="-1" type="button"' + (enqPage <= 1 ? ' disabled' : '') + '>Previous</button> Page ' + enqPage + ' of ' + pages + ' <button class="btn btn-sm" data-page="1" type="button"' + (enqPage >= pages ? ' disabled' : '') + '>Next</button></span>' : '');
        $('enq-all').checked = slice.length > 0 && slice.every((e) => selectedEnq.has(e.id));
        $('enq-bulk').hidden = selectedEnq.size === 0;
        $('enq-bulk-count').textContent = selectedEnq.size + ' selected';
    }

    function renderBoard() {
        const rows = filteredEnquiries(true);
        $('enq-empty').hidden = true;
        $('enq-bulk').hidden = true;
        $('enq-pager').innerHTML = '<span>' + rows.length + ' enquir' + (rows.length === 1 ? 'y' : 'ies') + ' on the board. Drag a card to another column to change its stage.</span>';
        $('enq-board').innerHTML = STAGES.map(([k, l]) => {
            const col = rows.filter((e) => e.status === k).sort((a, b) => priority(b).score - priority(a).score || new Date(b.created_at) - new Date(a.created_at));
            return '<div class="col" data-col="' + k + '"><div class="col-head"><span class="st-' + k + '">' + l + '</span><span class="n">' + col.length + '</span></div><div class="col-body">' +
                (col.length ? col.map((e) => '<div class="kcard" draggable="true" data-card="' + e.id + '" data-open-enq="' + e.id + '"><strong>' + esc(e.name) + '</strong>' + prioPill(e) + flagTags(e) +
                    '<span class="sub">' + esc(lookingFor(e)) + '</span><div class="row"><span class="sub" style="margin:0">' + esc(fmtDate(e.created_at)) + '</span>' + (isDue(e) ? '<span class="due">Follow-up due</span>' : (e.follow_up_on ? '<span class="sub" style="margin:0">Follow-up ' + esc(e.follow_up_on) + '</span>' : '')) + '</div></div>').join('') : '<span class="empty-note">Nothing here</span>') +
                '</div></div>';
        }).join('');
    }

    // drag and drop between stages
    let dragId = null;
    document.addEventListener('dragstart', (e) => { const c = e.target.closest && e.target.closest('[data-card]'); if (!c) return; dragId = Number(c.dataset.card); c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragId)); });
    document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.kcard.dragging').forEach((c) => c.classList.remove('dragging')); document.querySelectorAll('.col.over').forEach((c) => c.classList.remove('over')); });
    document.addEventListener('dragover', (e) => { const col = e.target.closest && e.target.closest('[data-col]'); if (!col || dragId == null) return; e.preventDefault(); document.querySelectorAll('.col.over').forEach((c) => c !== col && c.classList.remove('over')); col.classList.add('over'); });
    document.addEventListener('drop', guard(async (e) => {
        const col = e.target.closest && e.target.closest('[data-col]');
        if (!col || dragId == null) return;
        e.preventDefault();
        const id = dragId, stage = col.dataset.col, enq = enquiries.find((x) => x.id === id);
        dragId = null; col.classList.remove('over');
        if (!enq || enq.status === stage) return;
        await api('/api/admin/inquiries/' + id, { method: 'PATCH', body: { status: stage } });
        toast(enq.name + ' moved to ' + STAGE_LABEL[stage] + '.');
        await loadAll();
        if (stage === 'won') openEnquiry(enquiries.find((x) => x.id === id), { deal: true });
    }));

    document.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('.seg-btn'); if (!b) return;
        enqView = b.dataset.view;
        try { localStorage.setItem('cea_enq_view', enqView); } catch (err) { /* ignore */ }
        renderEnquiries();
    });
    ['enq-q', 'enq-status', 'enq-type', 'enq-source', 'enq-date', 'enq-due', 'enq-sort'].forEach((id) => $(id).addEventListener(id === 'enq-q' ? 'input' : 'change', () => { enqPage = 1; renderEnquiries(); }));
    $('enq-all').addEventListener('change', (e) => {
        filteredEnquiries().slice((enqPage - 1) * PAGE, enqPage * PAGE).forEach((r) => e.target.checked ? selectedEnq.add(r.id) : selectedEnq.delete(r.id));
        renderEnquiries();
    });
    $('enq-bulk-clear').addEventListener('click', () => { selectedEnq.clear(); renderEnquiries(); });
    $('enq-bulk-apply').addEventListener('click', guard(async () => {
        const status = $('enq-bulk-status').value;
        if (!status) return toast('Choose a stage first.');
        const r = await api('/api/admin/inquiries/bulk', { method: 'POST', body: { ids: [...selectedEnq], action: 'status', status } });
        toast(r.count + ' enquir' + (r.count === 1 ? 'y' : 'ies') + ' moved to ' + STAGE_LABEL[status] + '.');
        selectedEnq.clear(); await loadAll();
    }));
    $('enq-bulk-delete').addEventListener('click', guard(async () => {
        if (!confirm('Permanently delete ' + selectedEnq.size + ' selected enquir' + (selectedEnq.size === 1 ? 'y' : 'ies') + '? This cannot be undone.')) return;
        const r = await api('/api/admin/inquiries/bulk', { method: 'POST', body: { ids: [...selectedEnq], action: 'delete' } });
        toast(r.count + ' deleted.'); selectedEnq.clear(); await loadAll();
    }));
    $('enq-export').addEventListener('click', () => exportEnquiries(filteredEnquiries(enqView === 'board')));
    $('sys-exp-enq').addEventListener('click', () => exportEnquiries(enquiries));

    document.addEventListener('change', guard(async (e) => {
        const sel = e.target.closest('[data-stage]');
        if (sel) {
            const id = Number(sel.dataset.stage);
            await api('/api/admin/inquiries/' + id, { method: 'PATCH', body: { status: sel.value } });
            toast('Moved to ' + STAGE_LABEL[sel.value] + '.');
            await loadAll();
            if (sel.value === 'won') openEnquiry(enquiries.find((x) => x.id === id), { deal: true });
        }
        const cb = e.target.closest('[data-sel-enq]');
        if (cb) { const id = Number(cb.dataset.selEnq); cb.checked ? selectedEnq.add(id) : selectedEnq.delete(id); renderEnquiries(); }
        const lc = e.target.closest('[data-sel-lst]');
        if (lc) { const id = Number(lc.dataset.selLst); lc.checked ? selectedLst.add(id) : selectedLst.delete(id); renderListings(); }
    }));
    document.addEventListener('click', guard(async (e) => {
        const open = e.target.closest('[data-open-enq]');
        if (open && !e.target.closest('a, button[data-del-enq], select')) return openEnquiry(enquiries.find((x) => x.id === Number(open.dataset.openEnq)));
        const del = e.target.closest('[data-del-enq]');
        if (del) {
            const x = enquiries.find((r) => r.id === Number(del.dataset.delEnq));
            if (!confirm('Delete the enquiry from ' + (x ? x.name : 'this contact') + '? This cannot be undone.')) return;
            await api('/api/admin/inquiries/' + del.dataset.delEnq, { method: 'DELETE' });
            toast('Enquiry deleted.'); await loadAll();
        }
        const pg = e.target.closest('[data-page]');
        if (pg) { enqPage += Number(pg.dataset.page); renderEnquiries(); window.scrollTo({ top: 0 }); }
    }));
    $('enq-add').addEventListener('click', () => openEnquiry(null));

    // ------------------------------------------------------------------ modal plumbing
    function openModal(title, bodyHtml, footHtml) {
        $('js-modal').innerHTML = '<div class="modal-head"><h2>' + esc(title) + '</h2><button class="modal-x" type="button" data-close aria-label="Close">&times;</button></div><div class="modal-body">' + bodyHtml + '</div>' + (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '');
        $('js-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeModal() { $('js-overlay').classList.remove('open'); if (!$('js-palette').classList.contains('open')) document.body.style.overflow = ''; $('js-modal').innerHTML = ''; }
    $('js-overlay').addEventListener('mousedown', (e) => { if (e.target === $('js-overlay')) closeModal(); });
    document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });

    const stageOptions = (cur) => STAGES.map(([k, l]) => '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + l + '</option>').join('');
    const sourceOptions = (cur) => SOURCES.map(([k, l]) => '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + l + '</option>').join('');
    const timelineHtml = (id) => {
        const acts = actByInq[id] || [];
        return acts.length ? acts.map((a) => '<div class="tl"><div class="k">' + esc(KIND_LABEL[a.kind] || a.kind) + '<span class="when">' + esc(fmtDateTime(a.created_at)) + '</span></div><div class="b">' + esc(a.body) + '</div></div>').join('') : '<p class="empty-note">No activity yet. Log calls, messages and visits here.</p>';
    };

    // ------------------------------------------------------------------ enquiry modal (view / edit / add)
    function openEnquiry(e, opts = {}) {
        shareHandler = null;
        const isNew = !e;
        const d = e ? parseDetails(e.message) : {};
        const wa = e ? waLink(e.phone) : '';
        const details = Object.keys(d).length && d['Property enquiry for'] ? '<dl class="detail">' + Object.entries(d).filter(([k]) => !/^Accepted Terms/.test(k)).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' : '';
        const defKind = e ? (enquiryType(e) === 'rent' ? 'Rent' : 'Sale') : 'Sale';
        const matches = e ? matchesFor(e) : [];
        const body =
            (e ? '<div class="top-actions">' + prioPill(e) + flagTags(e) + (e.phone ? '<a class="btn btn-sm" href="tel:' + esc(e.phone) + '">' + IC.phone + 'Call</a>' : '') + (wa ? '<a class="btn btn-sm" href="' + wa + '" target="_blank" rel="noopener">' + IC.wa + 'WhatsApp</a>' : '') + (e.email ? '<a class="btn btn-sm" href="mailto:' + esc(e.email) + '">' + IC.mail + 'Email</a>' : '') + '<span class="updated">Received ' + esc(fmtDateTime(e.created_at)) + '</span></div>' : '') +
            details +
            '<div class="grid-2"><label class="field">Name *<input type="text" id="m-name" value="' + esc(e ? e.name : '') + '"></label>' +
            '<label class="field">Phone<input type="tel" id="m-phone" value="' + esc(e ? e.phone : '') + '"></label></div>' +
            '<div class="grid-2"><label class="field">Email<input type="email" id="m-email" value="' + esc(e ? e.email : '') + '"></label>' +
            '<label class="field">Source<select id="m-source">' + sourceOptions(e ? (e.source || 'website') : 'phone') + '</select></label></div>' +
            '<div class="grid-2"><label class="field">Stage<select id="m-status">' + stageOptions(opts.deal ? 'won' : (e ? e.status : 'new')) + '</select></label>' +
            '<label class="field">Follow up on<input type="date" id="m-follow" value="' + esc(e && e.follow_up_on ? e.follow_up_on : '') + '"></label></div>' +
            '<div class="dealbox" id="m-deal" hidden><div class="grid-2"><label class="field">Deal type<select id="m-dkind"><option' + ((e && e.deal_kind ? e.deal_kind : defKind) === 'Sale' ? ' selected' : '') + ' value="Sale">Sale (2% commission)</option><option' + ((e && e.deal_kind ? e.deal_kind : defKind) === 'Rent' ? ' selected' : '') + ' value="Rent">Rental (1 month\'s rent)</option></select></label>' +
            '<label class="field" id="m-dval-label">Deal value<input type="text" inputmode="numeric" id="m-dval" value="' + esc(e && e.deal_value ? e.deal_value : '') + '" placeholder="e.g. 24000000 or 85000"></label></div><div class="hint" id="m-deal-hint"></div></div>' +
            (isNew || !details ? '<label class="field">' + (isNew ? 'What are they looking for?' : 'Message') + '<textarea id="m-message" rows="4" placeholder="e.g. 3 BHK to rent near Koramangala, budget 80k">' + esc(e ? e.message : '') + '</textarea></label>' : '') +
            '<label class="field">Internal notes (only you can see these)<textarea id="m-notes" rows="3" placeholder="Preferences, family situation, next steps...">' + esc(e ? e.notes : '') + '</textarea></label>' +
            (e ? '<div><div class="section-title" style="margin-bottom:.5rem">Message on WhatsApp</div><div class="logrow" style="grid-template-columns:1fr auto"><select id="m-tpl">' + TEMPLATES.map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('') + '</select><button class="btn" type="button" id="m-tpl-send"' + (wa ? '' : ' disabled') + '>' + IC.wa + 'Open WhatsApp</button></div></div>' : '') +
            (e ? '<div><div class="section-title" style="margin-bottom:.5rem">Suggested properties (' + matches.length + ')</div><div class="matches">' + (matches.length ? matches.map((m) => '<div class="match"><div class="who"><strong>' + esc(m.l.property_name) + '</strong><span>' + esc(m.l.property_location) + ' · ' + esc(m.l.property_bhk) + ' · ' + esc(/^\d/.test(m.l.property_price) ? '₹' + m.l.property_price : m.l.property_price) + '</span></div><span class="score ' + (m.s < 70 ? 'mid' : '') + '">' + m.s + '%</span><button class="btn btn-sm" type="button" data-share="' + m.l.id + '"' + (wa ? '' : ' disabled') + '>Share</button></div>').join('') : '<p class="empty-note">No live listing matches this requirement yet.</p>') + '</div></div>' : '') +
            (e ? '<div><div class="section-title" style="margin-bottom:.5rem">Activity</div><div class="logrow"><select id="m-akind">' + ACTIVITY_KINDS.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select><textarea id="m-abody" rows="2" placeholder="What happened? e.g. Spoke for 5 mins, wants a weekend visit"></textarea><button class="btn btn-primary" type="button" id="m-alog">Log</button></div><div class="timeline" id="m-timeline" style="margin-top:.7rem">' + timelineHtml(e.id) + '</div></div>' : '');
        const foot = (e ? '<button class="btn btn-danger" type="button" id="m-delete">Delete</button>' : '<span></span>') + '<span><button class="btn" type="button" data-close>Cancel</button> <button class="btn btn-primary" type="button" id="m-save">' + (isNew ? 'Add enquiry' : 'Save changes') + '</button></span>';
        openModal(isNew ? 'Add enquiry' : 'Enquiry from ' + e.name, body, foot);

        const refreshDeal = () => {
            const won = $('m-status').value === 'won';
            $('m-deal').hidden = !won;
            if (!won) return;
            const kind = $('m-dkind').value, v = Number(String($('m-dval').value).replace(/[^\d.]/g, ''));
            $('m-dval-label').firstChild.textContent = kind === 'Rent' ? 'Monthly rent (₹)' : 'Sale price (₹)';
            if (v > 0) { const fee = kind === 'Rent' ? v : v * 0.02; $('m-deal-hint').textContent = 'Your commission: ' + money(fee) + ' + GST ' + money(fee * 0.18) + ' = ' + money(fee * 1.18); }
            else $('m-deal-hint').textContent = 'Enter the deal value to record your commission.';
        };
        ['m-status', 'm-dkind'].forEach((id) => $(id).addEventListener('change', refreshDeal));
        $('m-dval').addEventListener('input', refreshDeal);
        refreshDeal();
        if (opts.deal) setTimeout(() => $('m-dval').focus(), 50);

        $('m-save').addEventListener('click', guard(async () => {
            const payload = { name: $('m-name').value, phone: $('m-phone').value, email: $('m-email').value, source: $('m-source').value, status: $('m-status').value, follow_up_on: $('m-follow').value || null, notes: $('m-notes').value };
            if ($('m-message')) payload.message = $('m-message').value;
            if (payload.status === 'won') { payload.deal_kind = $('m-dkind').value; payload.deal_value = String($('m-dval').value).replace(/[^\d.]/g, '') || null; }
            if (!payload.name.trim()) return toast('Please enter a name.');
            const btn = $('m-save'); btn.disabled = true;
            try {
                if (isNew) await api('/api/admin/inquiries', { method: 'POST', body: payload });
                else await api('/api/admin/inquiries/' + e.id, { method: 'PATCH', body: payload });
                closeModal(); toast(isNew ? 'Enquiry added.' : 'Saved.'); await loadAll();
            } finally { btn.disabled = false; }
        }));
        if (!e) return;
        $('m-delete').addEventListener('click', guard(async () => {
            if (!confirm('Delete this enquiry permanently?')) return;
            await api('/api/admin/inquiries/' + e.id, { method: 'DELETE' });
            closeModal(); toast('Enquiry deleted.'); await loadAll();
        }));
        const logActivity = async (kind, bodyText) => {
            const r = await api('/api/admin/activities', { method: 'POST', body: { inquiry_id: e.id, kind, body: bodyText } });
            activities.unshift(r.data); indexData();
            if ($('m-timeline')) $('m-timeline').innerHTML = timelineHtml(e.id);
        };
        $('m-alog').addEventListener('click', guard(async () => {
            const text = $('m-abody').value.trim();
            if (!text) return toast('Write what happened first.');
            await logActivity($('m-akind').value, text);
            $('m-abody').value = ''; toast('Activity logged.'); renderAll();
        }));
        $('m-tpl-send').addEventListener('click', guard(async () => {
            const t = TEMPLATES.find((x) => x[0] === $('m-tpl').value);
            window.open(waLink(e.phone, t[2](e)), '_blank', 'noopener');
            await logActivity('whatsapp', 'Opened WhatsApp with template: ' + t[1]); renderAll();
        }));
        shareHandler = guard(async (sh) => {
            const l = listings.find((x) => x.id === Number(sh.dataset.share));
            const price = /^\d/.test(l.property_price) ? '₹' + l.property_price : l.property_price;
            const text = 'Hi ' + first(e) + ', based on your requirement, this property may suit you: ' + l.property_name + ', ' + l.property_location + '. ' + l.property_bhk + '. Price: ' + price + '. Would you like to arrange a visit? - Sajjad, Corporate Estate Avenue';
            window.open(waLink(e.phone, text), '_blank', 'noopener');
            await logActivity('whatsapp', 'Shared listing on WhatsApp: ' + l.property_name); renderAll();
        });
    }
    let shareHandler = null;
    document.addEventListener('click', (ev) => { const sh = ev.target.closest('[data-share]'); if (sh && shareHandler) shareHandler(sh); });

    // ------------------------------------------------------------------ listings
    function filteredListings() {
        const q = $('lst-q').value.trim().toLowerCase(), ty = $('lst-type').value, feat = $('lst-featured').checked, sort = $('lst-sort').value;
        const rows = listings.filter((l) => {
            if (listingStatus !== 'all' && l.status !== listingStatus) return false;
            if (ty && (l.listing_type || 'Sale') !== ty) return false;
            if (feat && !l.featured) return false;
            if (q && !(l.property_name + ' ' + l.property_location + ' ' + l.name + ' ' + l.phone + ' ' + l.email + ' ' + l.property_type).toLowerCase().includes(q)) return false;
            return true;
        });
        rows.sort((a, b) => sort === 'old' ? new Date(a.created_at) - new Date(b.created_at)
            : sort === 'featured' ? (Number(b.featured) - Number(a.featured)) || (new Date(b.created_at) - new Date(a.created_at))
            : new Date(b.created_at) - new Date(a.created_at));
        return rows;
    }

    function renderListings() {
        const counts = { pending: 0, approved: 0, rejected: 0, all: listings.length };
        listings.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
        if (!listingStatusChosen) listingStatus = counts.pending > 0 ? 'pending' : 'all';
        $('lst-chips').innerHTML = LISTING_STATUS.map(([k, l]) => '<button type="button" class="chip' + (listingStatus === k ? ' active' : '') + '" data-lchip="' + k + '">' + l + '<span class="n">' + (counts[k] || 0) + '</span></button>').join('');
        const rows = filteredListings();
        $('lst-empty').hidden = rows.length > 0;
        $('lst-cards').style.display = rows.length ? '' : 'none';
        $('lst-cards').innerHTML = rows.map((l) => {
            const imgs = (l.images || []).filter(safeUrl);
            const photo = safeUrl(l.cover_thumb) || imgs[0];
            const wa = waLink(l.phone);
            const interested = l.status === 'approved' ? enquiriesFor(l).length : 0;
            return '<article class="lcard"><div class="photo" ' + (imgs.length ? 'data-lightbox="' + l.id + '"' : '') + '>' +
                (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy" decoding="async">' : 'No photos uploaded') +
                (l.featured ? '<span class="star">★ Featured</span>' : '') + (imgs.length > 1 ? '<span class="count">' + imgs.length + ' photos</span>' : '') + '</div>' +
                '<div class="body"><div><label class="check"><input type="checkbox" data-sel-lst="' + l.id + '"' + (selectedLst.has(l.id) ? ' checked' : '') + '> <span class="pill pill-' + esc(l.status) + '">' + (l.status === 'approved' ? 'Live' : esc(l.status)) + '</span> <span class="pill pill-src">' + esc(l.listing_type || 'Sale') + '</span>' + (interested ? ' <span class="tag tag-repeat">' + interested + ' interested</span>' : '') + '</label></div>' +
                '<h3>' + esc(l.property_name) + '</h3><div class="meta">' + esc(l.property_type) + ' · ' + esc(l.property_location) + '</div>' +
                '<div class="price">' + esc(/^\d/.test(l.property_price) ? '₹' + l.property_price : l.property_price) + '</div><div class="meta">' + esc(l.property_bhk) + '</div>' +
                '<div class="owner"><strong>' + esc(l.name) + '</strong><br>' + esc(l.phone) + ' · ' + esc(l.email) + '<br><span>Submitted ' + esc(fmtDate(l.created_at)) + '</span>' +
                    '<div class="contact-links">' + (l.phone ? '<a class="btn btn-sm btn-icon" href="tel:' + esc(l.phone) + '" title="Call owner">' + IC.phone + '</a>' : '') + (wa ? '<a class="btn btn-sm btn-icon" href="' + wa + '" target="_blank" rel="noopener" title="WhatsApp owner">' + IC.wa + '</a>' : '') + (l.email ? '<a class="btn btn-sm btn-icon" href="mailto:' + esc(l.email) + '" title="Email owner">' + IC.mail + '</a>' : '') + '</div></div>' +
                '<div class="actions">' +
                (l.status !== 'approved' ? '<button class="btn btn-sm btn-ok" data-lstatus="approved" data-id="' + l.id + '" type="button">Approve &amp; publish</button>' : '<button class="btn btn-sm" data-lstatus="pending" data-id="' + l.id + '" type="button">Unpublish</button>') +
                (l.status === 'pending' ? '<button class="btn btn-sm btn-danger" data-lstatus="rejected" data-id="' + l.id + '" type="button">Reject</button>' : '') +
                '<button class="btn btn-sm" data-feature="' + l.id + '" type="button">' + (l.featured ? 'Unfeature' : 'Feature') + '</button>' +
                '<button class="btn btn-sm" data-edit-lst="' + l.id + '" type="button">Edit</button>' +
                '<button class="btn btn-sm btn-danger" data-del-lst="' + l.id + '" type="button">Delete</button></div></div></article>';
        }).join('');
        $('lst-bulk').hidden = selectedLst.size === 0;
        $('lst-bulk-count').textContent = selectedLst.size + ' selected';
    }

    ['lst-q', 'lst-type', 'lst-sort', 'lst-featured'].forEach((id) => $(id).addEventListener(id === 'lst-q' ? 'input' : 'change', renderListings));
    $('lst-bulk-clear').addEventListener('click', () => { selectedLst.clear(); renderListings(); });
    $('lst-export').addEventListener('click', () => exportListings(filteredListings()));
    $('sys-exp-lst').addEventListener('click', () => exportListings(listings));
    $('lst-add').addEventListener('click', () => openListing(null));
    document.addEventListener('click', guard(async (e) => {
        const chip = e.target.closest('[data-lchip]');
        if (chip) { listingStatus = chip.dataset.lchip; listingStatusChosen = true; renderListings(); return; }
        const st = e.target.closest('[data-lstatus]');
        if (st) {
            const status = st.dataset.lstatus, id = Number(st.dataset.id);
            if (status === 'approved' && !confirm('Approve this listing? It goes live on the public website within about a minute.')) return;
            if (status === 'pending' && !confirm('Unpublish this listing? It will be removed from the public website.')) return;
            await api('/api/admin/properties/' + id + '/status', { method: 'PATCH', body: { status } });
            toast(status === 'approved' ? 'Approved. It will appear on the website shortly.' : status === 'rejected' ? 'Listing rejected.' : 'Listing unpublished.');
            await loadAll(); return;
        }
        const ft = e.target.closest('[data-feature]');
        if (ft) {
            const l = listings.find((x) => x.id === Number(ft.dataset.feature));
            await api('/api/admin/properties/' + l.id, { method: 'PATCH', body: { featured: !l.featured } });
            toast(l.featured ? 'Removed from featured.' : 'Featured. It will show first on the website.'); await loadAll(); return;
        }
        const ed = e.target.closest('[data-edit-lst]');
        if (ed) return openListing(listings.find((x) => x.id === Number(ed.dataset.editLst)));
        const dl = e.target.closest('[data-del-lst]');
        if (dl) {
            const l = listings.find((x) => x.id === Number(dl.dataset.delLst));
            if (!confirm('Delete "' + (l ? l.property_name : 'this listing') + '" and its photos permanently?')) return;
            await api('/api/admin/properties/' + dl.dataset.delLst, { method: 'DELETE' });
            toast('Listing deleted.'); await loadAll(); return;
        }
        const lb = e.target.closest('[data-lightbox]');
        if (lb) { const l = listings.find((x) => x.id === Number(lb.dataset.lightbox)); openLightbox((l.images || []).filter(safeUrl), 0); return; }
        const bulk = e.target.closest('[data-lbulk]');
        if (bulk) {
            const status = bulk.dataset.lbulk;
            if (!confirm('Apply "' + status + '" to ' + selectedLst.size + ' listing(s)?')) return;
            const r = await api('/api/admin/properties/bulk', { method: 'POST', body: { ids: [...selectedLst], action: 'status', status } });
            toast(r.count + ' listing(s) updated.'); selectedLst.clear(); await loadAll();
        }
        const th = e.target.closest('[data-thumb]');
        if (th) { const l = listings.find((x) => x.id === Number(th.dataset.thumb)); openLightbox((l.images || []).filter(safeUrl), Number(th.dataset.idx)); }
        const oe = e.target.closest('[data-open-from-lst]');
        if (oe) { closeModal(); openEnquiry(enquiries.find((x) => x.id === Number(oe.dataset.openFromLst))); }
    }));

    // ------------------------------------------------------------------ listing modal (edit / add)
    let newPhotos = [];
    function openListing(l) {
        const isNew = !l;
        newPhotos = [];
        const imgs = l ? (l.images || []).filter(safeUrl) : [];
        const interested = l && l.status === 'approved' ? enquiriesFor(l) : [];
        const typeOpts = (cur) => (PROPERTY_TYPES.includes(cur) || !cur ? PROPERTY_TYPES : PROPERTY_TYPES.concat([cur])).map((t) => '<option' + (t === cur ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
        const body =
            (imgs.length ? '<div class="thumbs">' + imgs.map((u, i) => '<img src="' + esc(u) + '" alt="" data-thumb="' + l.id + '" data-idx="' + i + '" loading="lazy">').join('') + '</div>' : '') +
            '<div class="grid-3"><label class="field">Listing type<select id="l-type">' + ['Sale', 'Rent', 'Lease'].map((t) => '<option value="' + t + '"' + ((l ? l.listing_type : 'Sale') === t ? ' selected' : '') + '>' + (t === 'Sale' ? 'For sale' : t === 'Rent' ? 'For rent' : 'For lease') + '</option>').join('') + '</select></label>' +
            '<label class="field">Property type<select id="l-ptype">' + typeOpts(l ? l.property_type : 'Luxury Apartment') + '</select></label>' +
            '<label class="field">Price *<input type="text" id="l-price" value="' + esc(l ? l.property_price : '') + '" placeholder="e.g. 2.4 Cr or 85,000 / month"></label></div>' +
            '<div class="grid-2"><label class="field">Property name *<input type="text" id="l-name" value="' + esc(l ? l.property_name : '') + '"></label>' +
            '<label class="field">Location *<input type="text" id="l-loc" value="' + esc(l ? l.property_location : '') + '" placeholder="e.g. Koramangala, Bangalore"></label></div>' +
            '<label class="field">Size / configuration *<input type="text" id="l-bhk" value="' + esc(l ? l.property_bhk : '') + '" placeholder="e.g. 3 BHK, 2,200 sq.ft"></label>' +
            '<label class="field">Description<textarea id="l-desc" rows="4">' + esc(l ? l.property_description : '') + '</textarea></label>' +
            '<div class="grid-3"><label class="field">Owner name<input type="text" id="l-oname" value="' + esc(l ? l.name : '') + '" placeholder="Corporate Estate Avenue"></label>' +
            '<label class="field">Owner phone<input type="tel" id="l-ophone" value="' + esc(l ? l.phone : '') + '"></label>' +
            '<label class="field">Owner email<input type="email" id="l-oemail" value="' + esc(l ? l.email : '') + '"></label></div>' +
            (isNew ? '<div><div class="drop" id="l-drop">Click to add up to 5 photos (they are resized automatically)<input type="file" id="l-files" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></div><div class="thumbs" id="l-previews" style="margin-top:.6rem"></div></div>' : '') +
            '<label class="field">Internal notes (never shown publicly)<textarea id="l-notes" rows="3">' + esc(l ? l.admin_notes : '') + '</textarea></label>' +
            '<div class="top-actions"><label class="check"><input type="checkbox" id="l-featured"' + (l && l.featured ? ' checked' : '') + '> Featured (shown first on the website)</label>' +
            (isNew ? '<label class="check"><input type="checkbox" id="l-live" checked> Publish immediately</label>' : '') + '</div>' +
            (l ? '<div><div class="section-title" style="margin-bottom:.5rem">Interested buyers / tenants (' + interested.length + ')</div><div class="matches">' + (interested.length ? interested.map((m) => '<div class="match"><div class="who"><strong>' + esc(m.e.name) + '</strong><span>' + esc(lookingFor(m.e)) + '</span></div><span class="score ' + (m.s < 75 ? 'mid' : '') + '">' + m.s + '%</span><button class="btn btn-sm" type="button" data-open-from-lst="' + m.e.id + '">Open</button></div>').join('') : '<p class="empty-note">' + (l.status === 'approved' ? 'No open enquiry matches this listing yet.' : 'Approve the listing to see matching enquiries.') + '</p>') + '</div></div>' : '');
        openModal(isNew ? 'Add listing' : 'Edit listing', body, '<span></span><span><button class="btn" type="button" data-close>Cancel</button> <button class="btn btn-primary" type="button" id="l-save">' + (isNew ? 'Add listing' : 'Save changes') + '</button></span>');

        if (isNew) {
            const drop = $('l-drop'), input = $('l-files');
            drop.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                Array.from(input.files).forEach((f) => { if (newPhotos.length < 5 && /^image\/(jpeg|png|webp|gif)$/.test(f.type)) newPhotos.push(f); });
                input.value = '';
                $('l-previews').innerHTML = newPhotos.map((f) => '<img src="' + URL.createObjectURL(f) + '" alt="">').join('');
                drop.firstChild.textContent = newPhotos.length + ' photo(s) selected. Click to add more (max 5).';
            });
        }
        $('l-save').addEventListener('click', guard(async () => {
            const v = (id) => $(id).value.trim();
            const f = { type: v('l-type'), ptype: v('l-ptype'), price: v('l-price'), name: v('l-name'), loc: v('l-loc'), bhk: v('l-bhk'), desc: v('l-desc'), oname: v('l-oname'), ophone: v('l-ophone'), oemail: v('l-oemail'), notes: v('l-notes'), featured: $('l-featured').checked };
            if (!f.price || !f.name || !f.loc || !f.bhk) return toast('Please fill in the price, name, location and size.');
            const btn = $('l-save'); btn.disabled = true;
            try {
                if (isNew) {
                    const fd = new FormData();
                    fd.append('listing-type', f.type); fd.append('property-type', f.ptype); fd.append('property-price', f.price); fd.append('property-name', f.name);
                    fd.append('property-location', f.loc); fd.append('property-bhk', f.bhk); fd.append('property-description', f.desc);
                    if (f.oname) fd.append('name', f.oname); if (f.ophone) fd.append('phone', f.ophone); if (f.oemail) fd.append('email', f.oemail);
                    fd.append('admin_notes', f.notes); fd.append('featured', String(f.featured)); fd.append('status', $('l-live').checked ? 'approved' : 'pending');
                    if (newPhotos.length) {
                        btn.textContent = 'Optimising photos...';
                        const parts = await optimiseImages(newPhotos);
                        parts.images.forEach((p) => fd.append('images', p));
                        if (parts.thumb) fd.append('thumb', parts.thumb);
                        btn.textContent = 'Saving...';
                    }
                    const r = await api('/api/admin/properties', { method: 'POST', body: fd });
                    toast(r.message);
                } else {
                    await api('/api/admin/properties/' + l.id, { method: 'PATCH', body: {
                        listing_type: f.type, property_type: f.ptype, property_price: f.price, property_name: f.name, property_location: f.loc, property_bhk: f.bhk,
                        property_description: f.desc, name: f.oname || l.name, phone: f.ophone, email: f.oemail || l.email, admin_notes: f.notes, featured: f.featured,
                    } });
                    toast('Listing saved.');
                }
                closeModal(); await loadAll();
            } finally { btn.disabled = false; btn.textContent = isNew ? 'Add listing' : 'Save changes'; }
        }));
    }

    // ---- client-side photo optimiser (same approach as the public upload forms)
    async function loadBitmap(file) {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch (e) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    }
    async function resizeToFile(bmp, maxDim, quality, name) {
        const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        let blob = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
        return new File([blob], name + (blob.type === 'image/webp' ? '.webp' : '.jpg'), { type: blob.type });
    }
    async function optimiseImages(files) {
        const bmps = []; for (const f of files) bmps.push(await loadBitmap(f));
        let images = [];
        for (const [dim, q] of [[1600, 0.8], [1280, 0.7], [1024, 0.6]]) {
            images = []; for (let i = 0; i < bmps.length; i++) images.push(await resizeToFile(bmps[i], dim, q, 'photo-' + (i + 1)));
            if (images.reduce((n, f) => n + f.size, 0) <= 3.8 * 1024 * 1024) break;
        }
        const thumb = bmps.length ? await resizeToFile(bmps[0], 640, 0.72, 'thumb') : null;
        bmps.forEach((b) => b.close && b.close());
        return { images, thumb };
    }

    // ------------------------------------------------------------------ analytics
    function renderAnalytics() {
        const range = Number($('an-range').value);
        const since = range ? Date.now() - range * DAY : 0;
        const inRange = enquiries.filter((e) => new Date(e.created_at).getTime() >= since);
        const won = enquiries.filter((e) => e.status === 'won'), lost = enquiries.filter((e) => e.status === 'lost');
        const closedRate = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null;
        const days = won.filter((e) => e.closed_at).map((e) => (new Date(e.closed_at) - new Date(e.created_at)) / DAY);
        const avgDays = days.length ? (days.reduce((a, b) => a + b, 0) / days.length) : null;
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const rev = (list) => list.reduce((n, e) => { const c = commission(e); return n + (c ? c.fee : 0); }, 0);
        const revMonth = rev(won.filter((e) => e.closed_at && new Date(e.closed_at) >= monthStart)), revAll = rev(won);
        const open = enquiries.filter((e) => !isClosed(e)).length;
        const kpi = (label, val, sub) => '<div class="kpi" style="cursor:default"><div class="label">' + label + '</div><div class="num" style="font-size:1.7rem">' + val + '</div>' + (sub ? '<div class="updated">' + sub + '</div>' : '') + '</div>';
        $('an-kpis').innerHTML =
            kpi('Enquiries in period', inRange.length, range ? 'last ' + range + ' days' : 'all time') +
            kpi('Win rate', closedRate == null ? '-' : closedRate + '%', won.length + ' won · ' + lost.length + ' lost') +
            kpi('Open pipeline', open, 'still being worked') +
            kpi('Avg days to win', avgDays == null ? '-' : avgDays.toFixed(1), days.length + ' deal(s)') +
            kpi('Commission this month', revMonth ? money(revMonth) : '-', 'excl. GST') +
            kpi('Commission all time', revAll ? money(revAll) : '-', 'excl. GST');

        // daily bars
        const span = range || 90;
        const buckets = Array(span).fill(0);
        enquiries.forEach((e) => { const dAgo = Math.floor((Date.now() - new Date(e.created_at).getTime()) / DAY); if (dAgo >= 0 && dAgo < span) buckets[span - 1 - dAgo]++; });
        const max = Math.max(1, ...buckets);
        $('an-daily').innerHTML = '<div class="daily">' + buckets.map((n, i) => { const d = new Date(Date.now() - (span - 1 - i) * DAY); return '<div class="d" style="height:' + Math.max(n ? 6 : 2, Math.round(n / max * 100)) + '%;' + (n ? '' : 'opacity:.25') + '" title="' + esc(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })) + ': ' + n + '"></div>'; }).join('') + '</div><div class="daily-axis"><span>' + esc(new Date(Date.now() - (span - 1) * DAY).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })) + '</span><span>Peak: ' + max + ' a day</span><span>Today</span></div>';

        const bars = (items, cls) => {
            const m = Math.max(1, ...items.map((i) => i[1]));
            return '<div class="bars">' + items.map(([l, n]) => '<div class="bar ' + (cls || '') + '"><span>' + esc(l) + '</span><div class="track"><div class="fill" style="width:' + Math.round(n / m * 100) + '%"></div></div><span class="v">' + n + '</span></div>').join('') + '</div>';
        };
        const stageIdx = (e) => STAGES.findIndex(([k]) => k === e.status);
        const reached = (min) => inRange.filter((e) => e.status !== 'lost' && stageIdx(e) >= min).length;
        $('an-funnel').innerHTML = bars([['All enquiries', inRange.length], ['Contacted', reached(1)], ['Site visit', reached(2)], ['Negotiating', reached(3)], ['Won', reached(4)], ['Lost', inRange.filter((e) => e.status === 'lost').length]], 'good');
        const tally = (fn) => { const o = {}; inRange.forEach((e) => { const k = fn(e); o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
        $('an-source').innerHTML = inRange.length ? bars(tally((e) => SOURCE_LABEL[e.source || 'website'] || e.source)) : '<p class="empty-note">No enquiries in this period.</p>';
        const typeRows = tally((e) => ({ purchase: 'Wants to buy', rent: 'Wants to rent', other: 'Other services' }[enquiryType(e)]));
        const cats = {}; inRange.forEach((e) => { const d = parseDetails(e.message)['Preferred property type']; if (!isBlank(d)) d.split(',').forEach((t) => { cats[t.trim()] = (cats[t.trim()] || 0) + 1; }); });
        const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
        $('an-type').innerHTML = inRange.length ? bars(typeRows, 'alt') + (catRows.length ? '<div class="section-title" style="margin:1rem 0 .6rem">Most requested property types</div>' + bars(catRows, 'alt') : '') : '<p class="empty-note">No enquiries in this period.</p>';

        // demand vs supply by area
        const demand = {}; inRange.forEach((e) => { const req = requirement(e); req.loc.forEach((x) => { const k = x.replace(/\b\w/g, (c) => c.toUpperCase()); demand[k] = (demand[k] || 0) + 1; }); });
        const supply = {}; listings.filter((l) => l.status === 'approved').forEach((l) => { const k = String(l.property_location || '').split(',')[0].trim().replace(/\b\w/g, (c) => c.toUpperCase()); if (k) supply[k] = (supply[k] || 0) + 1; });
        const areas = [...new Set([...Object.keys(demand), ...Object.keys(supply)])].map((a) => [a, demand[a] || 0, supply[a] || 0]).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]) || b[1] - a[1]).slice(0, 8);
        $('an-areas').innerHTML = areas.length ? '<table class="areas"><thead><tr><th>Area</th><th>Enquiries</th><th>Live listings</th><th></th></tr></thead><tbody>' + areas.map(([a, d, s]) => '<tr><td>' + esc(a) + '</td><td>' + d + '</td><td>' + s + '</td><td>' + (d > 0 && s === 0 ? '<span class="gap">Need listings</span>' : d > s ? '<span class="gap">Short supply</span>' : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="empty-note">Add live listings and locations in enquiries to see this.</p>';

        const lc = (st) => listings.filter((l) => l.status === st).length;
        $('an-listings').innerHTML = bars([['Live on site', lc('approved')], ['Pending approval', lc('pending')], ['Rejected', lc('rejected')], ['For sale (live)', listings.filter((l) => l.status === 'approved' && l.listing_type === 'Sale').length], ['For rent/lease (live)', listings.filter((l) => l.status === 'approved' && l.listing_type !== 'Sale').length], ['Featured', listings.filter((l) => l.featured).length]]) +
            '<div class="section-title" style="margin:1rem 0 .4rem">Won deals</div>' + (won.length ? won.slice(0, 5).map((e) => { const c = commission(e); return '<div class="mini"><div class="who"><strong>' + esc(e.name) + '</strong><span>' + esc(e.deal_kind || '') + (e.deal_value ? ' · ' + money(e.deal_value) : ' · value not recorded') + '</span></div><span style="color:var(--ok);font-weight:700">' + (c ? money(c.fee) : '-') + '</span></div>'; }).join('') : '<p class="empty-note">No won deals yet. Move an enquiry to Won and enter the deal value to track commission.</p>');
    }
    $('an-range').addEventListener('change', renderAnalytics);

    // ------------------------------------------------------------------ lightbox
    function openLightbox(images, i) { if (!images.length) return; lightbox = { images, i }; $('js-lb-img').src = images[i]; $('js-lightbox').classList.add('open'); $('js-lightbox').querySelector('.lb-prev').hidden = $('js-lightbox').querySelector('.lb-next').hidden = images.length < 2; }
    function closeLightbox() { $('js-lightbox').classList.remove('open'); $('js-lb-img').src = ''; }
    function stepLightbox(d) { lightbox.i = (lightbox.i + d + lightbox.images.length) % lightbox.images.length; $('js-lb-img').src = lightbox.images[lightbox.i]; }
    $('js-lightbox').addEventListener('click', (e) => {
        if (e.target.closest('.lb-close') || e.target === $('js-lightbox')) closeLightbox();
        else if (e.target.closest('.lb-next')) stepLightbox(1); else if (e.target.closest('.lb-prev')) stepLightbox(-1);
    });

    // ------------------------------------------------------------------ command palette (Ctrl+K or /)
    let palItems = [], palSel = 0;
    function paletteOpen() {
        $('js-palette').classList.add('open'); document.body.style.overflow = 'hidden';
        $('js-palette-input').value = ''; paletteRender(); setTimeout(() => $('js-palette-input').focus(), 20);
    }
    function paletteClose() { $('js-palette').classList.remove('open'); if (!$('js-overlay').classList.contains('open')) document.body.style.overflow = ''; }
    function paletteRender() {
        const q = $('js-palette-input').value.trim().toLowerCase();
        const cmds = [
            { k: 'Action', t: 'Add enquiry', s: 'Log a phone, walk-in or referral lead', run: () => openEnquiry(null) },
            { k: 'Action', t: 'Add listing', s: 'Create a property listing', run: () => openListing(null) },
            { k: 'Go to', t: 'Overview', s: '', run: () => goTab('overview') }, { k: 'Go to', t: 'Enquiries', s: '', run: () => goTab('enquiries', 'all') },
            { k: 'Go to', t: 'Follow-ups due', s: '', run: () => goTab('enquiries', 'due') }, { k: 'Go to', t: 'Listings awaiting approval', s: '', run: () => goTab('listings', 'pending') },
            { k: 'Go to', t: 'Analytics', s: '', run: () => goTab('analytics') }, { k: 'Go to', t: 'System & tools', s: '', run: () => goTab('system') },
        ];
        let items = [];
        if (!q) items = cmds;
        else {
            items = cmds.filter((c) => c.t.toLowerCase().includes(q));
            enquiries.filter((e) => (e.name + ' ' + e.phone + ' ' + e.email + ' ' + e.notes).toLowerCase().includes(q)).slice(0, 6).forEach((e) => items.push({ k: 'Enquiry', t: e.name, s: (e.phone || e.email) + ' · ' + lookingFor(e), run: () => openEnquiry(e) }));
            listings.filter((l) => (l.property_name + ' ' + l.property_location + ' ' + l.name + ' ' + l.phone).toLowerCase().includes(q)).slice(0, 6).forEach((l) => items.push({ k: 'Listing', t: l.property_name, s: l.property_location + ' · ' + l.status, run: () => openListing(l) }));
        }
        palItems = items.slice(0, 12); palSel = 0;
        $('js-palette-list').innerHTML = palItems.length ? palItems.map((it, i) => '<button type="button" class="pitem' + (i === 0 ? ' sel' : '') + '" data-pi="' + i + '"><div><strong>' + esc(it.t) + '</strong>' + (it.s ? '<span class="s">' + esc(it.s) + '</span>' : '') + '</div><span class="tagk">' + esc(it.k) + '</span></button>').join('') : '<p class="empty-note" style="padding:1rem">Nothing found.</p>';
    }
    function paletteRun(i) { const it = palItems[i]; if (!it) return; paletteClose(); it.run(); }
    function paletteMove(d) { if (!palItems.length) return; palSel = (palSel + d + palItems.length) % palItems.length; document.querySelectorAll('.pitem').forEach((el, i) => { el.classList.toggle('sel', i === palSel); if (i === palSel) el.scrollIntoView({ block: 'nearest' }); }); }
    $('js-palette-btn').addEventListener('click', paletteOpen);
    $('js-palette-input').addEventListener('input', paletteRender);
    $('js-palette-list').addEventListener('click', (e) => { const b = e.target.closest('[data-pi]'); if (b) paletteRun(Number(b.dataset.pi)); });
    $('js-palette').addEventListener('mousedown', (e) => { if (e.target === $('js-palette')) paletteClose(); });
    document.addEventListener('keydown', (e) => {
        if ($('js-app').hidden) return;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('js-palette').classList.contains('open') ? paletteClose() : paletteOpen(); return; }
        if (e.key === '/' && !typing && !$('js-overlay').classList.contains('open')) { e.preventDefault(); paletteOpen(); return; }
        if ($('js-palette').classList.contains('open')) {
            if (e.key === 'Escape') paletteClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); paletteMove(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); paletteMove(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); paletteRun(palSel); }
            return;
        }
        if (e.key === 'Escape') { if ($('js-lightbox').classList.contains('open')) closeLightbox(); else if ($('js-overlay').classList.contains('open')) closeModal(); }
        if ($('js-lightbox').classList.contains('open')) { if (e.key === 'ArrowRight') stepLightbox(1); if (e.key === 'ArrowLeft') stepLightbox(-1); }
    });

    // ------------------------------------------------------------------ CSV export
    function download(name, rows) {
        const csv = '﻿' + rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = name + '-' + todayStr() + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Downloaded ' + (rows.length - 1) + ' row(s).');
    }
    function exportEnquiries(rows) {
        download('cea-enquiries', [['Received', 'Name', 'Phone', 'Email', 'Source', 'Stage', 'Priority', 'Follow up', 'Looking for', 'Message', 'Notes', 'Deal type', 'Deal value', 'Commission (excl. GST)', 'Closed on']].concat(
            rows.map((e) => { const c = commission(e); return [fmtDateTime(e.created_at), e.name, e.phone, e.email, SOURCE_LABEL[e.source || 'website'], STAGE_LABEL[e.status], priority(e).label, e.follow_up_on || '', lookingFor(e), e.message, e.notes, e.deal_kind || '', e.deal_value || '', c ? Math.round(c.fee) : '', e.closed_at ? fmtDate(e.closed_at) : '']; })));
    }
    function exportListings(rows) {
        download('cea-listings', [['Submitted', 'Status', 'Listing type', 'Property type', 'Name', 'Location', 'Size', 'Price', 'Featured', 'Owner', 'Owner phone', 'Owner email', 'Photos']].concat(
            rows.map((l) => [fmtDateTime(l.created_at), l.status, l.listing_type, l.property_type, l.property_name, l.property_location, l.property_bhk, l.property_price, l.featured ? 'Yes' : '', l.name, l.phone, l.email, (l.images || []).length])));
    }

    // ------------------------------------------------------------------ system tab
    function renderSystemSession() {
        const exp = Number(String(token).split('.')[0]);
        $('sys-session').innerHTML = '<dt>Signed in as</dt><dd>Administrator</dd><dt>Session ends</dt><dd>' + (exp ? esc(fmtDateTime(new Date(exp).toISOString())) : '-') + '</dd><dt>Data loaded</dt><dd>' + enquiries.length + ' enquiries, ' + listings.length + ' listings, ' + activities.length + ' activities</dd><dt>Shortcuts</dt><dd><kbd>Ctrl K</kbd> or <kbd>/</kbd> search everything</dd>';
    }
    $('sys-check').addEventListener('click', async () => {
        $('sys-status').innerHTML = '<dt>Website &amp; API</dt><dd>Checking...</dd>';
        const t0 = performance.now();
        try {
            const r = await (await fetch('/api/health', { cache: 'no-store' })).json();
            const ms = Math.round(performance.now() - t0);
            const ok = r.database === 'connected';
            $('sys-status').innerHTML = '<dt>Website &amp; API</dt><dd><span class="dot ok"></span>Online (' + ms + ' ms)</dd><dt>Database</dt><dd><span class="dot ' + (ok ? 'ok' : 'bad') + '"></span>' + (ok ? 'Connected' : 'Problem: ' + esc(r.database)) + '</dd><dt>Checked</dt><dd>' + esc(new Date().toLocaleTimeString('en-IN')) + '</dd>';
        } catch (e) {
            $('sys-status').innerHTML = '<dt>Website &amp; API</dt><dd><span class="dot bad"></span>Could not reach the server</dd>';
        }
    });

    // ------------------------------------------------------------------ go
    showApp();
})();
