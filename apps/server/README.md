# dispatcherone-server (FastAPI)

This folder contains the backend server for DispatcherOne (multi-PC network mode).

Quick start (server):
1) Create `.env` (see below)
2) Run: `docker compose up -d --build`

## Environment variables
Create a file at `apps/server/.env`:

```env
ADMIN_PASSWORD=change_me_now

POSTGRES_USER=dispatcherone
POSTGRES_PASSWORD=dispatcherone_dev_pw
POSTGRES_DB=dispatcherone
POSTGRES_HOST=db
POSTGRES_PORT=5432

