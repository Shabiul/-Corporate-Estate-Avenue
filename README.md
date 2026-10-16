# Corporate Estate Avenue

Real-estate marketing site (Bangalore) with contact/listing forms and an admin dashboard.
Static frontend + Express 5 API, backed by Supabase (PostgREST + Storage), deployed on Vercel.

## Setup
1. Run [schema.sql](schema.sql) in Supabase and create a public Storage bucket `property-images`.
2. `cp .env.example .env` and fill in the values (admin login stays disabled until all admin vars are set). On Vercel, add the same variables under Project Settings → Environment Variables.
3. `npm install && npm run dev` → http://localhost:3000 (admin console at `/admin.html`: buyer enquiries and owner property submissions).

Without Supabase storage configured, local dev saves images to `uploads/`; on Vercel storage is required.

## Admin console (`/admin.html`)
Sign in with `ADMIN_USER` / `ADMIN_PASS` from `.env`. Sections:
- **Overview**: KPIs (new, hot, due, quiet leads, approvals), pipeline, a "what needs you today" list.
- **Enquiries**: list or drag-and-drop **board** by stage; lead priority (hot / warm / cold), repeat-enquirer and quiet-lead flags; activity timeline (calls, notes, visits, stage changes); WhatsApp templates; suggested properties matched to each enquiry; follow-up dates; deal value and commission when a deal is won; bulk actions; CSV export.
- **Listings**: approve / reject / unpublish, feature, edit, add your own with photos, see interested buyers per listing, bulk actions, CSV export.
- **Analytics**: enquiries per day, win rate, conversion funnel, sources, demand vs supply by area, commission earned.
- **System & tools**: health check, session info, exports. Press `Ctrl K` (or `/`) anywhere to search everything.
