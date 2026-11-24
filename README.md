# OmniLearn AI

OmniLearn is a React, TypeScript, and Vite learning workspace. Firebase is used only for Authentication and Cloud Firestore. AI requests go through a Vercel serverless endpoint to OpenRouter; there are no Firebase Cloud Functions or `firebase-admin` dependencies.

The AI engine routes code explanation, flowcharts, bug review, translation, and Big-O analysis to NVIDIA Nemotron 3 Ultra, with Gemma 4 31B as fallback. Study guides, quizzes, flashcards, and document Q&A use Gemma 4 31B with Gemma 4 26B as fallback. Fish Audio generates optional spoken study summaries. Free-model availability and rate limits depend on OpenRouter and may change.

## Local setup

Requirements: Node.js 22+ and npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set the four `VITE_FIREBASE_*` values in `.env.local` from Firebase Console → Project settings → Your apps. Enable Email/Password and Google Authentication, create a Firestore database, and add `localhost` plus the deployed app domain to Authentication's authorized domains. Google sign-in uses a popup, falling back to a same-tab redirect if the browser blocks it. If you browse locally at `127.0.0.1`, add that host to the authorized domains too, or use `http://localhost:5173`. Deploy `firestore.rules` before testing protected features:

```powershell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

The app requires verified email accounts. If Firebase reports `permission-denied`, deploy the current rules to the same project configured in `.env.local`, verify the account, and confirm the account is not suspended.

Room document uploads use Cloudinary's `authenticated` delivery type. The browser never receives the API secret; room members request signed upload parameters and member-checked download links from the Vercel endpoint. Signed download links can still be forwarded by someone who has access to them. Add the three Cloudinary variables to `.env.local` for local use and to Vercel's server environment for production, then redeploy. Documents are limited to 10 MB and PDF, DOCX, PPTX, XLSX, CSV, Markdown, or plain text.

## OpenRouter configuration

For production, deploy the project to Vercel and add these server environment variables in the Vercel project settings:

- `OPENROUTER_API_KEY`: OpenRouter key, server-side only.
- `FIREBASE_PROJECT_ID`: Firebase project ID used by the web app.
- `APP_URL`: the deployed app's origin, used in OpenRouter request headers.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`: server-only credentials for signed, authenticated room-document uploads and downloads.

Set the public `VITE_FIREBASE_*` values in Vercel as well. Redeploy after changing environment variables. Do not set `OPENROUTER_API_KEY` as a `VITE_` variable or put it in source control.

For local development, the browser first tries `/api/ai`. If that route is unavailable, the engine can call OpenRouter directly only when `VITE_OPENROUTER_API_KEY` is set in the developer's ignored `.env.local` and Vite is running in development mode. Never configure that fallback in a production build. The Vercel endpoint is [`api/ai.js`](./api/ai.js); shared token verification and OpenRouter forwarding are in [`server/openRouterProxy.js`](./server/openRouterProxy.js).

Cloudflare Pages can use the equivalent adapter in [`functions/api/ai.js`](./functions/api/ai.js), with `OPENROUTER_API_KEY`, `FIREBASE_PROJECT_ID`, and optionally `APP_URL` configured as Pages environment variables.

Firebase Authentication ID tokens are verified server-side using Google's public signing keys. The endpoint checks verified email and the user's Firestore `isBanned` state before forwarding any request. AI request bodies are restricted to the configured task/model allowlist and size limits. Firebase App Check, Firestore quotas, and OpenRouter's own free-model limits are separate controls and should be considered before public launch.

## Features

- **CodeLingo:** explain code, draw Mermaid flowcharts, identify likely bugs, translate between supported languages, and analyze time/space Big-O complexity.
- **EduNotes AI:** extract selectable PDF text in the browser and read scanned PDF pages with vision-capable AI when a study guide or document answer is requested; analyze text or images, create summaries, concept maps, flashcards, and quizzes, and optionally generate an Arabic or English voice summary.
- **Study rooms:** live Firestore whiteboard, peer-to-peer audio/video and screen sharing for small groups, signed Cloudinary document sharing, and an Arabic/English AI tutor with spoken answers and shared concept maps. Direct WebRTC calls use public STUN only and can be blocked by restrictive networks; production reliability across all networks requires a TURN service.
- **Administration:** Firestore-backed reports, account suspension/restoration, and room closing. Closing a room hides it from active rooms while preserving nested messages and board data.

Code, documents, and images are sent to OpenRouter only when the user requests an AI operation. The app stores activity metadata and quiz scores in Firestore, not raw code or study documents. Review OpenRouter and model-provider data policies before sharing sensitive material.

## Administrator access and moderation

Admin authority comes from the protected `users/{uid}.isAdmin` field. To provision the first administrator, create and verify that account normally, then set `isAdmin: true` on its `users/{uid}` profile in the Firebase Console using a trusted project-owner account. Do not let users set this field through the app; Firestore rules reject client-side role escalation. The Admin tab appears after the profile listener receives the updated value.

Admins can update only another user's `isBanned` field, resolve reports, and set active rooms to `isActive: false`. Banned users can read their own profile to see the suspension notice, but Firestore rules block their access to rooms, reports, events, and other protected data. The app also watches the profile so a suspension takes effect in the open workspace.

## Validation

```powershell
npm run build
npm run test:rules
npm run test:proxy
```

The rules test suite uses the Firestore Emulator and covers user isolation, admin authorization, role escalation, moderation writes, banned-account access, room meeting signaling, and shared-document authorization. The proxy suite checks Firebase token verification, ban enforcement, model allowlisting, request-size limits, and that Firebase tokens are not forwarded to OpenRouter.

## Troubleshooting

- **Google sign-in / COOP warnings:** Confirm the current hostname is listed under Firebase Authentication → Settings → Authorized domains; allow popups for the site, and use the same Firebase project in the browser app configuration and Google provider setup.
- **Insufficient permissions in a meeting or room:** deploy the current `firestore.rules` to the same Firebase project used by the app (`npx firebase-tools deploy --only firestore:rules`), verify the email, and inspect `users/{uid}.isBanned`. Room subscriptions start only after Firestore confirms that the user is a room member.
- **Scanned PDF reports no readable text:** choose Create study guide or Ask your document; scanned pages are sent to the vision model then, in batches of two. Split PDFs that exceed the 40,000-character supported output limit.
- **AI endpoint returns 503:** configure `OPENROUTER_API_KEY` and `FIREBASE_PROJECT_ID` in the hosting provider's server environment, then redeploy.
- **Model rate limit or unavailable:** the engine retries the configured fallback model automatically. If both free models are unavailable, retry later.
- **Missing favicon:** the app includes an inline SVG favicon, so the browser should not need `/favicon.ico`.

## Repository map

- [`src/services/omniEngine.ts`](./src/services/omniEngine.ts): model routing, fallback, task prompts, response validation, and speech client.
- [`src/services/firebaseData.ts`](./src/services/firebaseData.ts): Firestore data and admin moderation operations.
- [`firestore.rules`](./firestore.rules): access control for users, rooms, activity, and reports.
- [`security-tests/firestore-rules.test.mjs`](./security-tests/firestore-rules.test.mjs): Firestore Emulator authorization tests.
- [`vercel.json`](./vercel.json): Cross-Origin-Opener-Policy response header.
