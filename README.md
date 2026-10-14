# Corporate Estate Avenue

Real-estate marketing site (Bangalore) with contact/listing forms and an admin dashboard.
Static frontend + Express 5 API, backed by Supabase (PostgREST + Storage), deployed on Vercel.

## Setup
1. Run [schema.sql](schema.sql) in Supabase and create a public Storage bucket `property-images`.
2. `cp .env.example .env` and fill in the values (admin login stays disabled until all admin vars are set).
3. `npm install && npm run dev` → http://localhost:3000 (admin at `/admin.html`).

Without Supabase storage configured, local dev saves images to `uploads/`; on Vercel storage is required.
