# 1Booking v2.0.3 — Railway Blank Screen Fix

## Fix

- Patched frontend API fallback for Railway production.
- Frontend now uses same-origin backend when deployed on Railway.
- Local development continues to use `http://127.0.0.1:8000` when running through Vite on port `5173`.
- Updated browser title to `1Booking`.

## Test URLs after Railway redeploy

- `/` should open the 1Booking web app.
- `/api/health` should show the backend health JSON.

## Default login

- Username: `admin`
- Password: `admin123`
