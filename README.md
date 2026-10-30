# UtaNexa – React Native app (Expo + NativeWind)

Mobile app built against the real **UtaNexa FastAPI backend** (`backend/`). Every endpoint
in `src/api/endpoints.js` comes from the backend route files – nothing is guessed.

## Features (all wired to the backend)
| Area | Screens / what works | Backend |
|---|---|---|
| Auth | Register (OTP), Login, Forgot password (OTP), Logout, auto-login | `/api/auth/*` |
| Home | Connections list, Friend / Family filter (long-press to set), open chat / couple chat | `/api/connections`, `/category` |
| Search | Search people, send / accept connection request | `/api/search/people`, `/api/connections/*` |
| Alerts | Pending requests (Accept / Reject), activity feed, mark read | `/api/connections/requests`, `/notifications` |
| Profile | Own + connected users' profiles, stats, reels, saved reels, posts, edit profile, change photo, follow / unfollow | `/api/profile/*`, `/api/reels/*`, `/api/connections/follow*` |
| Reels | Infinite feed, star rating, comments (add/delete), save, share, report, not-interested, delete own, watch analytics | `/api/reels/*` |
| Reel upload | Video + caption, hashtags, language, category | `POST /api/reels/upload` |
| Chat | History, text + photo/video/file/audio, delete own message, read ticks, live typing + online/last-seen | `/api/chat/*`, `WS /api/chat/ws/{id}` |
| Couple chat | Realtime messages, typing, online, delivered/seen ticks, moods, suggestions | `WS /ws/couple/{id}` |
| NEXA AI | Chat with the NEXA assistant | `POST /api/ai-assistant/chat` |

## Run
```bash
npm install
npx expo install --fix
EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:8000 npx expo start   # scan QR with Expo Go
```
Start the backend with `uvicorn backend.server:app --host 0.0.0.0 --port 8000`.
Defaults when `EXPO_PUBLIC_API_URL` is not set: Android emulator `http://10.0.2.2:8000`,
iOS simulator / web `http://localhost:8000`. For production use your `https://` URL
(sockets automatically switch to `wss://`).

## How login works
The backend authenticates only with the `usanex_session` cookie and marks it `Secure`.
On a phone using plain `https://` that cookie would be dropped, so the app reads it from
the login response, keeps it in SecureStore and sends it as a `Cookie` header on every
request and WebSocket (`src/api/client.js`). No backend change needed.

## Backend things to know
- Reel upload and profile-photo upload need `CLOUDINARY_URL` (or the 3 `CLOUDINARY_*` vars) on the server.
- Registration / password-reset OTPs are shown in the app (`development_otp`) because the backend returns them in dev mode.
- A profile can only be opened for **connected** users (backend rule, 403 otherwise).
- The backend has **no endpoints** for: creating image posts, "Nex Moments", clearing notifications, a couple-AI, or `users` router (`/api/users/*` is not mounted in `server.py`). Those web features are therefore not in the app. If you add them to the backend, add the paths to `endpoints.js`.
- Web build (`expo start --web`) would need CORS with credentials on the server (currently `allow_origins=["*"]`, which browsers reject with cookies). The native app is unaffected.

## If login bounces back to the Login screen
The app now checks `/api/auth/me` right after login and shows an error if the session cookie wasn't kept.
Fix (recommended, 1 line) in `backend/routes/auth.py`, in the `login()` return value, add the token:
```python
    return {
        "success": True,
        "message": "Login successful",
        "user": serialize_user(user),
        "session_token": session_token,   # <-- add this line
    }
```
Then redeploy the backend (Render). The app sends it back as the `usanex_session` cookie itself.
Also make sure `API_BASE_URL` is your `https://usanex.onrender.com` URL and that you test on Expo Go / a device,
not the web preview (browsers block this cookie across origins).
"# usanexa_app" 
