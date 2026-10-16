require('dotenv').config({ quiet: true });

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const dbHelpers = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase config for Storage (REST API)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const STORAGE_BUCKET = 'property-images';
const STORAGE_URL = supabaseUrl ? `${supabaseUrl}/storage/v1` : null;

// Local uploads directory (development fallback only; Vercel's filesystem is read-only)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const IS_SERVERLESS = !!process.env.VERCEL;
const storageConfigured = !!(STORAGE_URL && supabaseServiceKey);

// Allowed upload types; the stored extension comes from the MIME type, never the client filename
const IMAGE_EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

// Configure Multer with memory storage (works on Vercel)
const uploadParser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (IMAGE_EXTENSIONS[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, WebP or GIF images are allowed.'));
        }
    }
});

// New-style keys (sb_secret_...) are not JWTs: send them in `apikey` only. Legacy service-role JWTs also go in Authorization.
const supabaseAuthHeaders = () => (supabaseServiceKey && supabaseServiceKey.startsWith('sb_')
    ? { 'apikey': supabaseServiceKey }
    : { 'apikey': supabaseServiceKey, 'Authorization': `Bearer ${supabaseServiceKey}` });

const upload = uploadParser.fields([{ name: 'images', maxCount: 5 }, { name: 'thumb', maxCount: 1 }]);

async function uploadToSupabase(file, suffix = '') {
    const fileName = `property-${crypto.randomUUID()}${suffix}${IMAGE_EXTENSIONS[file.mimetype]}`;
    const res = await fetch(`${STORAGE_URL}/object/${STORAGE_BUCKET}/${fileName}`, {
        method: 'POST',
        headers: {
            ...supabaseAuthHeaders(),
            'Content-Type': file.mimetype,
            // random file names never change, so browsers/CDN may keep them for a year (saves egress)
            'Cache-Control': 'max-age=31536000',
        },
        body: file.buffer,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase storage upload failed (${res.status}): ${text}`);
    }
    return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${fileName}`;
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve only the public frontend files (never server.js, database.js, .env, etc.)
const PUBLIC_FILES = [
    'index.html', 'admin.html', 'styles.css', 'script.js', 'admin.js',
    'robots.txt', 'sitemap.xml',
    'bangalore_skyline.png', 'prop_apartment.png', 'prop_commercial.png', 'prop_villa.png', 'sajjad_pasha.jpg',
    'logo.png', 'logo-white.png', 'brai-logo.jpeg', 'nar-india-logo.jpeg',
    'privacy.html', 'terms.html', 'nav.js',
    'bangalore_skyline-1024.webp', 'bangalore_skyline-640.webp', 'og-image.jpg', 'icon-192.png',
    'prop_villa-128.webp', 'prop_apartment-128.webp', 'logo-360.webp', 'logo-white-360.webp',
    'sajjad_pasha-768.webp', 'sajjad_pasha-144.webp',
];

// Cache lifetimes by file type (images rarely change; css/js are versioned with ?v=)
const cacheFor = (file) => {
    if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(file)) return { maxAge: '7d' };
    if (/\.(css|js)$/i.test(file)) return { maxAge: '1h' };
    return { maxAge: 0 };
};
PUBLIC_FILES.forEach((file) => {
    app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file), cacheFor(file)));
});
if (!IS_SERVERLESS) {
    app.use('/uploads', express.static(UPLOADS_DIR));
}
// Clean URLs for the legal pages
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
// Service pages: /services/<slug> (whitelist only)
const SERVICE_SLUGS = ['owner-representation', 'client-representation', 'nri-expat', 'corporate-relocation'];
app.get('/services/:slug', (req, res, next) => {
    if (!SERVICE_SLUGS.includes(req.params.slug)) return next();
    res.sendFile(path.join(__dirname, 'services', `${req.params.slug}.html`));
});

// Minimal in-memory rate limiter (per instance; best-effort on serverless)
function rateLimit({ windowMs, max }) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip;
        const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
        if (recent.length >= max) {
            return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
        }
        recent.push(now);
        hits.set(key, recent);
        if (hits.size > 5000) {
            for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
        }
        next();
    };
}
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const MAX_FIELD = 200;
const MAX_TEXT = 5000;
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
const tooLong = (obj, limits) => Object.entries(limits).some(([k, n]) => obj[k] != null && String(obj[k]).length > n);
// Row IDs: integers or UUIDs only (these are interpolated into PostgREST filters)
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

// 1. Submit Buyer Enquiry (Contact Form)
const ENQUIRY_TYPES = ['Flat', 'Penthouse', 'Villa', 'Independent House', 'Row House', 'Plot / Land'];
const ENQUIRY_CONFIGS = ['2 BHK', '3 BHK', '4 BHK', '5 BHK or Above'];
const pickAllowed = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

app.post('/api/contact', publicLimiter, async (req, res) => {
    try {
        const { name, email, phone, enquiryFor, location, budget, requirements, projectPreferences, consent } = req.body;
        if (!name || !email || !phone) {
            return res.status(400).json({ success: false, message: 'Name, mobile number and email are required.' });
        }
        if (consent !== true) {
            return res.status(400).json({ success: false, message: 'Please accept the Terms & Conditions and Privacy Policy.' });
        }
        if (!isEmail(email) || tooLong(req.body, { name: MAX_FIELD, phone: 50, location: MAX_FIELD, budget: MAX_FIELD, requirements: MAX_TEXT, projectPreferences: MAX_TEXT })) {
            return res.status(400).json({ success: false, message: 'Please provide valid details.' });
        }

        const purpose = enquiryFor === 'Rent' ? 'Rent' : 'Purchase';
        const types = pickAllowed(req.body.propertyTypes, ENQUIRY_TYPES);
        const configs = pickAllowed(req.body.configurations, ENQUIRY_CONFIGS);
        const message = [
            `Property enquiry for: ${purpose}`,
            `Preferred property type: ${types.join(', ') || 'Not specified'}`,
            `Preferred configuration: ${configs.join(', ') || 'Not specified'}`,
            `Preferred location / area: ${clean(location) || 'Not specified'}`,
            `Approximate budget: ${clean(budget) || 'Not specified'}`,
            `Specific requirements: ${clean(requirements) || 'None'}`,
            `Preferences on project: ${clean(projectPreferences) || 'None'}`,
            'Accepted Terms & Conditions and Privacy Policy: Yes',
        ].join('\n');

        await dbHelpers.saveInquiry({
            name, email, phone,
            service: purpose === 'Rent' ? 'buyer-rent' : 'buyer-purchase',
            message,
        });
        res.status(200).json({ success: true, message: 'Your enquiry has been successfully sent!' });
    } catch (error) {
        console.error('Error saving contact inquiry:', error);
        res.status(500).json({ success: false, message: 'An error occurred while saving your enquiry. Please try again.' });
    }
});

const LISTING_TYPES = ['Sale', 'Rent', 'Lease'];

// Public: approved listings only (no owner contact details)
app.get('/api/properties', async (req, res) => {
    try {
        const data = await dbHelpers.getApprovedProperties();
        res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error loading public listings:', error.message);
        res.status(200).json({ success: true, data: [] });
    }
});

// Stores uploaded photos (Supabase Storage, or local disk in development)
async function storeUploadedImages(req) {
    const imageFiles = (req.files && req.files.images) || [];
    const thumbFile = req.files && req.files.thumb && req.files.thumb[0];
    let imageUrls = [];
    let thumbUrl = null;
    if (imageFiles.length > 0) {
        if (storageConfigured) {
            imageUrls = await Promise.all(imageFiles.map((f) => uploadToSupabase(f)));
            if (thumbFile) thumbUrl = await uploadToSupabase(thumbFile, '-t');
        } else if (!IS_SERVERLESS) {
            await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
            const saveLocal = async (file, suffix = '') => {
                const fileName = `property-${crypto.randomUUID()}${suffix}${IMAGE_EXTENSIONS[file.mimetype]}`;
                await fs.promises.writeFile(path.join(UPLOADS_DIR, fileName), file.buffer);
                return `/uploads/${fileName}`;
            };
            for (const file of imageFiles) imageUrls.push(await saveLocal(file));
            if (thumbFile) thumbUrl = await saveLocal(thumbFile, '-t');
        } else {
            throw new Error('Image storage is not configured.');
        }
    }
    return { imageUrls, thumbUrl };
}

// 2. Upload Property Listing (Form Data with Multiple Images)
app.post('/api/upload', publicLimiter, upload, async (req, res) => {
    try {
        const { name, phone, email, 'property-type': type, 'property-name': pName, 'property-location': location, 'property-bhk': bhk, 'property-price': price, 'property-description': description, 'listing-type': listingType } = req.body;

        if (!name || !phone || !email || !type || !pName || !location || !bhk || !price) {
            return res.status(400).json({ success: false, message: 'All required property fields must be filled.' });
        }
        if (req.body.consent !== 'yes') {
            return res.status(400).json({ success: false, message: 'Please accept the Terms & Conditions and Privacy Policy.' });
        }

        if (!isEmail(email) || tooLong(req.body, {
            name: MAX_FIELD, phone: 50, 'property-type': MAX_FIELD, 'property-name': MAX_FIELD,
            'property-location': MAX_FIELD, 'property-bhk': MAX_FIELD, 'property-price': MAX_FIELD,
            'property-description': MAX_TEXT,
        })) {
            return res.status(400).json({ success: false, message: 'Please provide valid details.' });
        }

        const { imageUrls, thumbUrl } = await storeUploadedImages(req);

        await dbHelpers.saveProperty({
            name,
            phone,
            email,
            property_type: type,
            property_name: pName,
            property_location: location,
            property_bhk: bhk,
            property_price: price,
            property_description: description || '',
            listing_type: LISTING_TYPES.includes(listingType) ? listingType : 'Sale',
            status: 'pending', // never public until an admin approves it
            images: imageUrls,
            cover_thumb: thumbUrl
        });

        res.status(200).json({ success: true, message: 'Your property has been successfully uploaded for review.' });
    } catch (error) {
        console.error('Error saving property upload:', error);
        res.status(error.status || 500).json({ success: false, message: 'An error occurred while uploading your property. Please try again.' });
    }
});

// Admin credentials (loaded from environment variables, see .env.example).
// There are no defaults: if unset, admin login is disabled.
// Strip a leading BOM (﻿) — some tools/editors inject one into env values.
const BOM = String.fromCharCode(0xFEFF);
const stripBOM = (s) => (typeof s === 'string' ? (s.startsWith(BOM) ? s.slice(1) : s).trim() : s);
const ADMIN_USER = stripBOM(process.env.ADMIN_USER);
const ADMIN_PASS = stripBOM(process.env.ADMIN_PASS);
const ADMIN_TOKEN_SECRET = stripBOM(process.env.ADMIN_TOKEN);
const adminConfigured = !!(ADMIN_USER && ADMIN_PASS && ADMIN_TOKEN_SECRET);
if (!adminConfigured) {
    console.warn('ADMIN_USER / ADMIN_PASS / ADMIN_TOKEN are not all set: admin login is disabled.');
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const sign = (payload) => crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(payload).digest('base64url');

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// Stateless signed token with expiry (works on serverless: no session store needed)
function issueToken() {
    const payload = String(Date.now() + TOKEN_TTL_MS);
    return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
    if (!adminConfigured || typeof token !== 'string') return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
    return Number(payload) > Date.now();
}

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ') && verifyToken(authHeader.slice(7))) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized access.' });
    }
};

const validId = (req, res, next) => {
    if (!ID_PATTERN.test(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid id.' });
    }
    next();
};

// 3. Admin Login
app.post('/api/admin/login', loginLimiter, (req, res) => {
    if (!adminConfigured) {
        return res.status(503).json({ success: false, message: 'Admin login is not configured.' });
    }
    const { username, password } = req.body;
    // Evaluate both comparisons so timing doesn't reveal which field was wrong
    const userOk = safeEqual(username ?? '', ADMIN_USER);
    const passOk = safeEqual(password ?? '', ADMIN_PASS);
    if (userOk && passOk) {
        res.json({ success: true, token: issueToken() });
    } else {
        res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
});

// 4. Get all Inquiries
app.get('/api/admin/inquiries', authenticateAdmin, async (req, res) => {
    try {
        const inquiries = await dbHelpers.getInquiries();
        res.json({ success: true, data: inquiries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// 5. Get all Properties
app.get('/api/admin/properties', authenticateAdmin, async (req, res) => {
    try {
        const properties = await dbHelpers.getProperties();
        res.json({ success: true, data: properties });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ---------------------------------------------------------------- CRM (admin only)
const INQUIRY_STATUSES = ['new', 'contacted', 'visit', 'negotiating', 'won', 'lost'];
const INQUIRY_SOURCES = ['website', 'phone', 'whatsapp', 'walk-in', 'referral', 'other'];
const PROPERTY_STATUSES = ['pending', 'approved', 'rejected'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const parseIds = (ids) => (Array.isArray(ids) && ids.length > 0 && ids.length <= 200 && ids.every((n) => Number.isInteger(n) && n > 0)) ? ids : null;
const isDateOnly = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Add an enquiry by hand (phone call, walk-in, referral...)
app.post('/api/admin/inquiries', authenticateAdmin, async (req, res) => {
    try {
        const b = req.body || {};
        const name = str(b.name, MAX_FIELD), phone = str(b.phone, 50), email = str(b.email, 254);
        if (!name || (!phone && !email)) {
            return res.status(400).json({ success: false, message: 'A name and a phone number or email are required.' });
        }
        if (email && !isEmail(email)) return res.status(400).json({ success: false, message: 'That email address is not valid.' });
        const id = await dbHelpers.saveInquiry({
            name, phone, email,
            service: str(b.service, MAX_FIELD) || 'manual',
            message: str(b.message, MAX_TEXT),
            status: INQUIRY_STATUSES.includes(b.status) ? b.status : 'new',
            source: INQUIRY_SOURCES.includes(b.source) ? b.source : 'phone',
            notes: str(b.notes, MAX_TEXT),
            follow_up_on: isDateOnly(b.follow_up_on) ? b.follow_up_on : null,
        });
        res.json({ success: true, id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Activity timeline (calls, notes, visits, stage changes)
const ACTIVITY_KINDS = ['note', 'call', 'whatsapp', 'email', 'visit', 'stage', 'system'];
const STAGE_NAMES = { new: 'New', contacted: 'Contacted', visit: 'Site visit', negotiating: 'Negotiating', won: 'Won', lost: 'Lost' };

app.get('/api/admin/activities', authenticateAdmin, async (req, res) => {
    try {
        res.json({ success: true, data: await dbHelpers.getActivities() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.post('/api/admin/activities', authenticateAdmin, async (req, res) => {
    try {
        const b = req.body || {};
        const inquiryId = Number(b.inquiry_id);
        if (!Number.isInteger(inquiryId) || inquiryId < 1) return res.status(400).json({ success: false, message: 'Invalid enquiry.' });
        const kind = ACTIVITY_KINDS.includes(b.kind) ? b.kind : 'note';
        const body = str(b.body, MAX_TEXT);
        if (!body) return res.status(400).json({ success: false, message: 'Please write something to log.' });
        if (!(await dbHelpers.getInquiry(inquiryId))) return res.status(404).json({ success: false, message: 'Enquiry not found.' });
        const activity = await dbHelpers.addActivity({ inquiry_id: inquiryId, kind, body });
        await dbHelpers.updateInquiry(inquiryId, {}); // touches updated_at so "last activity" stays accurate
        res.json({ success: true, data: activity });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Edit an enquiry: pipeline status, notes, follow-up date, source and contact details
app.patch('/api/admin/inquiries/:id', authenticateAdmin, validId, async (req, res) => {
    try {
        const b = req.body || {};
        const patch = {};
        if (b.status !== undefined) { if (!INQUIRY_STATUSES.includes(b.status)) return res.status(400).json({ success: false, message: 'Invalid status.' }); patch.status = b.status; }
        if (b.source !== undefined) { if (!INQUIRY_SOURCES.includes(b.source)) return res.status(400).json({ success: false, message: 'Invalid source.' }); patch.source = b.source; }
        if (b.notes !== undefined) patch.notes = str(b.notes, MAX_TEXT);
        if (b.message !== undefined) patch.message = str(b.message, MAX_TEXT);
        if (b.name !== undefined) { patch.name = str(b.name, MAX_FIELD); if (!patch.name) return res.status(400).json({ success: false, message: 'Name cannot be empty.' }); }
        if (b.phone !== undefined) patch.phone = str(b.phone, 50);
        if (b.email !== undefined) { patch.email = str(b.email, 254); if (patch.email && !isEmail(patch.email)) return res.status(400).json({ success: false, message: 'That email address is not valid.' }); }
        if (b.follow_up_on !== undefined) {
            if (b.follow_up_on === null || b.follow_up_on === '') patch.follow_up_on = null;
            else if (isDateOnly(b.follow_up_on)) patch.follow_up_on = b.follow_up_on;
            else return res.status(400).json({ success: false, message: 'Invalid follow-up date.' });
        }
        if (b.deal_kind !== undefined) { patch.deal_kind = ['Sale', 'Rent'].includes(b.deal_kind) ? b.deal_kind : null; }
        if (b.deal_value !== undefined) {
            if (b.deal_value === null || b.deal_value === '') patch.deal_value = null;
            else { const n = Number(b.deal_value); if (!Number.isFinite(n) || n < 0 || n > 1e12) return res.status(400).json({ success: false, message: 'Invalid deal value.' }); patch.deal_value = n; }
        }
        if (Object.keys(patch).length === 0) return res.status(400).json({ success: false, message: 'Nothing to update.' });
        const before = patch.status ? await dbHelpers.getInquiry(req.params.id) : null;
        if (patch.status) patch.closed_at = (patch.status === 'won' || patch.status === 'lost') ? new Date().toISOString() : null;
        const changes = await dbHelpers.updateInquiry(req.params.id, patch);
        if (changes > 0) {
            if (before && before.status !== patch.status) {
                await dbHelpers.addActivity({ inquiry_id: Number(req.params.id), kind: 'stage', body: `Stage changed: ${STAGE_NAMES[before.status] || before.status} → ${STAGE_NAMES[patch.status]}` }).catch((e) => console.error('activity log failed:', e.message));
            }
            res.json({ success: true });
        } else res.status(404).json({ success: false, message: 'Inquiry not found.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Bulk actions on enquiries: { ids: [1,2], action: 'status'|'delete', status? }
app.post('/api/admin/inquiries/bulk', authenticateAdmin, async (req, res) => {
    try {
        const { action, status } = req.body || {};
        const ids = parseIds(req.body && req.body.ids);
        if (!ids) return res.status(400).json({ success: false, message: 'Choose between 1 and 200 enquiries.' });
        if (action === 'delete') {
            const n = await dbHelpers.bulkDeleteInquiries(ids);
            return res.json({ success: true, count: n });
        }
        if (action === 'status' && INQUIRY_STATUSES.includes(status)) {
            const n = await dbHelpers.bulkUpdateInquiries(ids, { status, closed_at: (status === 'won' || status === 'lost') ? new Date().toISOString() : null });
            await Promise.all(ids.map((id) => dbHelpers.addActivity({ inquiry_id: id, kind: 'stage', body: `Stage set to ${STAGE_NAMES[status]} (bulk update)` }).catch(() => null)));
            return res.json({ success: true, count: n });
        }
        res.status(400).json({ success: false, message: 'Unknown bulk action.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Edit a listing's details (owner details, price, description, featured flag, internal notes)
app.patch('/api/admin/properties/:id', authenticateAdmin, validId, async (req, res) => {
    try {
        const b = req.body || {};
        const patch = {};
        const text = { property_type: MAX_FIELD, property_name: MAX_FIELD, property_location: MAX_FIELD, property_bhk: MAX_FIELD, property_price: MAX_FIELD, property_description: MAX_TEXT, name: MAX_FIELD, phone: 50, admin_notes: MAX_TEXT };
        for (const [k, max] of Object.entries(text)) {
            if (b[k] !== undefined) patch[k] = str(b[k], max);
        }
        for (const k of ['property_type', 'property_name', 'property_location', 'property_bhk', 'property_price', 'name']) {
            if (k in patch && !patch[k]) return res.status(400).json({ success: false, message: 'Please fill in all the required fields.' });
        }
        if (b.email !== undefined) { patch.email = str(b.email, 254); if (!isEmail(patch.email)) return res.status(400).json({ success: false, message: 'That email address is not valid.' }); }
        if (b.listing_type !== undefined) { if (!LISTING_TYPES.includes(b.listing_type)) return res.status(400).json({ success: false, message: 'Invalid listing type.' }); patch.listing_type = b.listing_type; }
        if (b.featured !== undefined) patch.featured = b.featured === true;
        if (Object.keys(patch).length === 0) return res.status(400).json({ success: false, message: 'Nothing to update.' });
        const changes = await dbHelpers.updateProperty(req.params.id, patch);
        if (changes > 0) res.json({ success: true });
        else res.status(404).json({ success: false, message: 'Property not found.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Add a listing yourself (goes live immediately unless you choose "pending")
app.post('/api/admin/properties', authenticateAdmin, upload, async (req, res) => {
    try {
        const b = req.body || {};
        const f = {
            name: str(b.name, MAX_FIELD) || 'Corporate Estate Avenue', phone: str(b.phone, 50) || '9880011922', email: str(b.email, 254) || 'sajjad@corporateestateavenue.com',
            property_type: str(b['property-type'], MAX_FIELD), property_name: str(b['property-name'], MAX_FIELD), property_location: str(b['property-location'], MAX_FIELD),
            property_bhk: str(b['property-bhk'], MAX_FIELD), property_price: str(b['property-price'], MAX_FIELD), property_description: str(b['property-description'], MAX_TEXT),
        };
        if (!f.property_type || !f.property_name || !f.property_location || !f.property_bhk || !f.property_price) {
            return res.status(400).json({ success: false, message: 'Please fill in the property type, name, location, size and price.' });
        }
        if (!isEmail(f.email)) return res.status(400).json({ success: false, message: 'That email address is not valid.' });
        const { imageUrls, thumbUrl } = await storeUploadedImages(req);
        const status = b.status === 'pending' ? 'pending' : 'approved';
        await dbHelpers.saveProperty({
            ...f,
            listing_type: LISTING_TYPES.includes(b['listing-type']) ? b['listing-type'] : 'Sale',
            status,
            approved_at: status === 'approved' ? new Date().toISOString() : null,
            featured: b.featured === 'true',
            admin_notes: str(b.admin_notes, MAX_TEXT),
            images: imageUrls,
            cover_thumb: thumbUrl,
        });
        res.json({ success: true, message: status === 'approved' ? 'Listing added and live on the website.' : 'Listing added as pending.' });
    } catch (error) {
        console.error('Error adding listing:', error);
        res.status(error.status || 500).json({ success: false, message: 'Could not add the listing.' });
    }
});

// Bulk approve / reject / unpublish / delete listings
app.post('/api/admin/properties/bulk', authenticateAdmin, async (req, res) => {
    try {
        const { action, status } = req.body || {};
        const ids = parseIds(req.body && req.body.ids);
        if (!ids) return res.status(400).json({ success: false, message: 'Choose between 1 and 200 listings.' });
        if (action === 'status' && PROPERTY_STATUSES.includes(status)) {
            const n = await dbHelpers.bulkSetPropertyStatus(ids, status);
            return res.json({ success: true, count: n });
        }
        res.status(400).json({ success: false, message: 'Unknown bulk action.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Approve / reject / unpublish a listing
app.patch('/api/admin/properties/:id/status', authenticateAdmin, validId, async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }
        const changes = await dbHelpers.setPropertyStatus(req.params.id, status);
        if (changes > 0) {
            res.json({ success: true, message: `Listing marked ${status}.` });
        } else {
            res.status(404).json({ success: false, message: 'Property not found.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// 6. Delete Inquiry
app.delete('/api/admin/inquiries/:id', authenticateAdmin, validId, async (req, res) => {
    try {
        const changes = await dbHelpers.deleteInquiry(req.params.id);
        if (changes > 0) {
            res.json({ success: true, message: 'Inquiry deleted successfully.' });
        } else {
            res.status(404).json({ success: false, message: 'Inquiry not found.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// 7. Delete Property
app.delete('/api/admin/properties/:id', authenticateAdmin, validId, async (req, res) => {
    try {
        const result = await dbHelpers.deleteProperty(req.params.id);
        if (result && result.changes > 0) {
            // Best-effort image cleanup; the row is already gone, so failures are only logged
            for (const url of (Array.isArray(result.images) ? result.images : [])) {
                try {
                    const fileName = decodeURIComponent(url.split('?')[0].split('/').pop() || '');
                    if (!/^property-[\w.-]+$/.test(fileName)) continue;
                    if (url.startsWith('/uploads/')) {
                        await fs.promises.unlink(path.join(UPLOADS_DIR, fileName)).catch(() => {});
                    } else if (storageConfigured) {
                        const r = await fetch(`${STORAGE_URL}/object/${STORAGE_BUCKET}/${fileName}`, {
                            method: 'DELETE',
                            headers: supabaseAuthHeaders(),
                        });
                        if (!r.ok) console.error('Storage delete failed:', r.status, fileName);
                    }
                } catch (e) {
                    console.error('Image cleanup error:', e.message);
                }
            }
            res.json({ success: true, message: 'Property deleted successfully.' });
        } else {
            res.status(404).json({ success: false, message: 'Property not found.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Debug health check
app.get('/api/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let dbStatus = 'unknown';
    try {
        await dbHelpers.ping();
        dbStatus = 'connected';
    } catch (e) {
        console.error('Health check DB error:', e.message);
        dbStatus = 'error';
    }
    res.json({ status: 'ok', database: dbStatus });
});

// Upload/validation errors (multer) -> 400 instead of a stack trace
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || /image/i.test(err.message || '')) {
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
});

// Fallback: Send main index.html for undefined routes
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Corporate Estate Avenue Backend running at http://localhost:${PORT}`);
    });
}

module.exports = app;
