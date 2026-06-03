# 1Booking v2.0.1 — Railway Frontend Root Fix

# 1Booking v2.0

# 1Booking — Railway + GitHub Deployment Build

This package is prepared for deployment to Railway through GitHub.

## What is included

- React frontend
- FastAPI backend
- JSON file storage for prototype/demo
- Dockerfile for Railway single-service deployment
- railway.json
- .gitignore and .dockerignore
- Sanitized default data with default admin user

## Default local/admin login

Username: `admin`

Password: `admin123`

Change this before sharing the URL outside your machine.

## Important prototype limitation

This build still uses JSON files for storage. On Railway, the filesystem can be ephemeral unless you attach persistent storage. For a production deployment, move the data layer to PostgreSQL/RDS/Supabase and move generated PDFs/posters to object storage.

## Local run

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Frontend:

```bash
cd frontend
npm config set registry https://registry.npmjs.org/
npm install
npm run dev
```

## Railway deploy overview

1. Push this folder to GitHub.
2. Create a new Railway project.
3. Choose Deploy from GitHub repo.
4. Select this repo.
5. Railway will detect the Dockerfile.
6. Add optional variables:
   - `ONEFACEID_QR_SECRET`
   - `ONEBOOKING_ALLOWED_ORIGINS`
7. Deploy.
8. Open the Railway public URL.

Because this is a single-service deployment, the frontend and backend run on the same Railway domain.
