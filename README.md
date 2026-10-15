# MZUNI Study Circle PWA

A mobile-friendly Progressive Web App for MZUNI Communication Studies students.

## Included in this project

- Email/password student registration and sign-in
- First-run administrator account from environment settings
- Four course areas:
  - Human Communication
  - Mass Communication
  - Communication Theory
  - English for Academic Purposes
- Admin-only upload, review, approval, rejection and deletion of learning resources
- Persistent application data and uploaded files, using the local filesystem for development and Supabase for hosting
- Study-room creation and invitation codes
- WebRTC audio/video signalling, with a four-participant room limit
- PWA manifest, service worker and app icon
- Responsive interface for phones and computers

## Requirements

- Node.js 18 or newer
- Internet access for initial package installation and real-time calls
- A microphone; camera is optional if the browser permits audio-only fallback

## Windows setup

1. Extract this ZIP into a **new folder**. Do not extract over an existing project.
2. Install Node.js LTS from https://nodejs.org/ if you do not already have it.
3. Open the extracted `mzuni-communication-studies-pwa` folder.
4. Copy `.env.example` to a new file named `.env` and change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` before the first run. The app loads this file automatically.
5. Open Command Prompt in the project folder and run:

   ```bat
   npm install
   npm start
   ```

6. Open http://localhost:3000 in your browser.
7. Register a student account. The first administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables on the first start, or uses the development defaults listed below if not configured.

### Configure admin credentials in Windows Command Prompt (alternative to `.env`)

Set these before the **first run** in a fresh project data folder:

```bat
set ADMIN_EMAIL=your-admin-email@example.com
set ADMIN_PASSWORD=Use-A-Long-Unique-Password
set JWT_SECRET=replace-with-a-long-random-secret
npm start
```

The first admin account is only seeded when no administrator exists. Changing environment values later does not change the password of an already-created admin; use a fresh test data folder or add a password-reset workflow before production.

**Development defaults (local testing only):**
- Email: `admin@mzuni.local`
- Password: `ChangeThisAdminPassword123!`

Change these before exposing the app to the internet. Do not reuse these credentials on a public server.

## Admin workflow

1. Sign in with the administrator account.
2. Select **Admin review**.
3. Upload a title, course, description and file.
4. Review the uploaded file, then approve it. Only approved resources appear in the student library.

Accepted files: PDF, DOC, DOCX, PPT, PPTX, TXT, JPG and PNG. Maximum file size: 15 MB.

## PWA installation

Run locally, then open the site in a Chromium-based browser. Choose the install icon in the address bar or browser menu. PWA installation and microphone/camera access require HTTPS on public hosting; `localhost` is treated as secure for local development.

The service worker caches the app shell for quicker loading, but API data, course files and live calls require a working server/network connection.

## Audio/video calls and networking

WebRTC media travels between browsers where possible. The Node server relays call signalling, not the media stream itself. The app includes a public STUN server for basic connectivity. Some mobile networks, campus networks and firewalls require a TURN relay for reliable connections; configure `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` on the server if you have a TURN service. TURN may incur charges.

The four-person limit is enforced by the signalling server for each active room. If the server restarts, active calls disconnect; students can create/join a room again.

## Persistent storage and deployment warning

- Locally, `data/database.json` stores account records, material metadata and rooms, and `uploads/` stores course files.
- On Render's free Web Service, the local filesystem is temporary. Configure Supabase database and Storage using the steps below to keep records and uploaded files across restarts and deploys.
- Passwords are hashed with bcryptjs.
- The JSON file is suitable for a small pilot, not heavy simultaneous production use.
- The hosted JSON state is stored in one Supabase JSONB row; this is suitable for a small pilot, not heavy concurrent use.
- Supabase free-plan quotas and inactivity policies apply and can change. The upload bucket is public so students can open course files; anyone with a file URL can access that file.
- Live room signalling stays in the web process, so keep one Render instance. Calls disconnect when the free service sleeps or restarts; students can rejoin.
- Back up your Supabase project regularly. Never commit real student records, uploaded files, secrets, or service-role keys to a public GitHub repository.
- Use HTTPS, strong secrets, backups, moderation rules and a privacy notice before real student use.

## Free deployment on Render

### Set up Supabase storage

1. Create a Supabase project on its free plan, if its current quotas and inactivity policies meet your needs.
2. In Supabase **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql) to create and seed the private app-state table.
3. In **Storage**, create a bucket named `study-uploads`, set it to **Public**, set its file size limit to **15 MB**, and allow these MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain`, `image/jpeg`, and `image/png`.
4. In **Project Settings > API**, copy the Project URL and the `service_role` secret key. Keep the service-role key private; it must only be set on the server, never in browser code.

### Create the free Render Web Service

1. Push this project to GitHub. In Render choose **New > Web Service** (not Blueprint), connect the repository, and select the **Free** instance type.
2. Set the build command to `npm install` and the start command to `npm start`. The app binds to Render's `PORT`; `/api/health` can be used as the health-check path.
3. In the service's **Environment** settings, add `NODE_ENV=production`, `JWT_SECRET` (a long random secret), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Optionally set `ADMIN_NAME`, `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL`. Audio/video uses HTTPS, the browser's microphone/camera, and the included public STUN server. Some networks require a TURN service.
5. Deploy and open the HTTPS URL Render assigns. Registration, sign-in, resource uploads and review, rooms, and WebSocket call signalling run in the web service. User records and course files are kept in Supabase, not on Render's temporary disk.

Render's free service may sleep when idle and has limited build/runtime hours. When it wakes, persisted accounts and files remain available through Supabase, but active calls disconnect. The service uses Render's `PORT` and supports WebSocket signalling. Keep one instance so live room signalling works as expected.

## Project layout

```text
mzuni-communication-studies-pwa/
├── server.js
├── package.json
├── README.md
├── .env.example
├── data/                 # created automatically at runtime
├── uploads/              # created automatically at runtime
├── supabase/
│   └── schema.sql
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── manifest.json
    ├── sw.js
    └── icon.svg
```

## Known first-version limitations

- No password reset or email verification yet.
- JSON file storage is not a replacement for a production database.
- Rooms and users are pilot-level; closed rooms remain in the JSON record for history.
- WebRTC call reliability depends on STUN/TURN and the participants' network conditions.
- The app does not record calls.
