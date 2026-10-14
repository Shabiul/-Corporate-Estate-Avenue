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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
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
const upload = multer({
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

async function uploadToSupabase(file) {
        const fileName = `property-${crypto.randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`;
    const res = await fetch(`${STORAGE_URL}/object/${STORAGE_BUCKET}/${fileName}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': file.mimetype,
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
    'logo.png', 'logo-white.png',
];
PUBLIC_FILES.forEach((file) => {
    app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
});
if (!IS_SERVERLESS) {
    app.use('/uploads', express.static(UPLOADS_DIR));
}

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

// 1. Submit Inquiry (Contact Form)
app.post('/api/contact', publicLimiter, async (req, res) => {
    try {
        const { name, email, phone, service, message } = req.body;
        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Name and email are required.' });
        }
        if (!isEmail(email) || tooLong(req.body, { name: MAX_FIELD, phone: 50, service: MAX_FIELD, message: MAX_TEXT })) {
            return res.status(400).json({ success: false, message: 'Please provide valid details.' });
        }
        
        await dbHelpers.saveInquiry({ name, email, phone, service, message });
        res.status(200).json({ success: true, message: 'Your inquiry has been successfully sent!' });
    } catch (error) {
        console.error('Error saving contact inquiry:', error);
        res.status(500).json({ success: false, message: 'An error occurred while saving your inquiry. Please try again.' });
    }
});

// 2. Upload Property Listing (Form Data with Multiple Images)
app.post('/api/upload', publicLimiter, upload.array('images', 5), async (req, res) => {
    try {
        const { name, phone, email, 'property-type': type, 'property-name': pName, 'property-location': location, 'property-bhk': bhk, 'property-price': price, 'property-description': description } = req.body;

        if (!name || !phone || !email || !type || !pName || !location || !bhk || !price) {
            return res.status(400).json({ success: false, message: 'All required property fields must be filled.' });
        }

        if (!isEmail(email) || tooLong(req.body, {
            name: MAX_FIELD, phone: 50, 'property-type': MAX_FIELD, 'property-name': MAX_FIELD,
            'property-location': MAX_FIELD, 'property-bhk': MAX_FIELD, 'property-price': MAX_FIELD,
            'property-description': MAX_TEXT,
        })) {
            return res.status(400).json({ success: false, message: 'Please provide valid details.' });
        }

        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            if (storageConfigured) {
                imageUrls = await Promise.all(req.files.map(f => uploadToSupabase(f)));
            } else if (!IS_SERVERLESS) {
                // Local development fallback: save to disk
                await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
                for (const file of req.files) {
                    const fileName = `property-${crypto.randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`;
                    await fs.promises.writeFile(path.join(UPLOADS_DIR, fileName), file.buffer);
                    imageUrls.push(`/uploads/${fileName}`);
                }
            } else {
                throw new Error('Image storage is not configured.');
            }
        }

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
            images: imageUrls
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
                            headers: { 'Authorization': `Bearer ${supabaseServiceKey}` },
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
    let dbStatus = 'unknown';
    try {
        await dbHelpers.getInquiries();
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
