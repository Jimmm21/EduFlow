<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d1aa2b15-5bee-4a15-950b-662585a6867c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run With Docker

1. Set `GEMINI_API_KEY` in your shell or a local `.env` file.
2. Build and start the container:
   `docker compose up --build`
3. Open the app at `http://localhost:3000`

## PostgreSQL Initial Database

The repo now includes an initial PostgreSQL schema and seed data:

- `docker/postgres/init/EduFlow_schema.sql`

Start only PostgreSQL:

`docker compose up -d postgres`

Connect with psql:

`docker compose exec postgres psql -U eduflow -d eduflow`

Useful checks:

- `\dt` to list tables
- `SELECT * FROM app_users;`
- `SELECT id, title, status FROM courses;`

The init SQL files run only on first container initialization.  
If you need to re-run init from scratch:

`docker compose down -v`

## Python Backend (Student Registration)

Student account creation now uses a Python API and saves to PostgreSQL.

1. Recommended (Docker): start DB + backend API:
   `docker compose up -d postgres backend`
2. Verify backend is up:
   `http://localhost:8001/health`
3. Set `VITE_API_BASE_URL=http://localhost:8001` in `.env.local`.
4. Run frontend:
   `npm run dev`

Manual (without Docker backend):

1. `python -m venv .venv`
2. `.venv\Scripts\activate`
3. `pip install -r backend/requirements.txt`
4. `uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload`

If your frontend is on a different localhost port (for example `3001`), set `CORS_ORIGINS` or
`CORS_ORIGIN_REGEX` in your environment and restart the API server.

Register endpoint:

- `POST http://localhost:8001/api/auth/register`

Course endpoints:

- `POST http://localhost:8001/api/admin/courses`
- `GET http://localhost:8001/api/admin/courses`
- `GET http://localhost:8001/api/admin/courses/{course_id}`
- `PUT http://localhost:8001/api/admin/courses/{course_id}`

## Docker Files

- `Dockerfile`: multi-stage production build
- `docker-compose.yml`: local container runner
- `docker/nginx.conf`: SPA routing support for React Router
