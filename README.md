# Fluke

**Open-source ALPR data explorer** — a play on [Flock](https://www.flock.com)

A web application for searching, importing, and managing ALPR (Automated License Plate Reader) data in the Twin Cities metro area.

## Stack

- **Backend:** PocketBase v0.25 (hosted on PikaPods)
- **Frontend:** React + Vite (hosted on Vercel)
- **Import:** Python scripts via `uv`

---

## 🛠 Local Development Guide

### 1. Requirements
- Node.js (v18+)
- Python 3.10+ and `uv` package manager

### 2. Start PocketBase (Backend)
```bash
# From the project root
./backend/pocketbase serve
```
PocketBase will run on `http://127.0.0.1:8090`. 
*(Note: Default superuser is `admin@local.dev` / `admin123456` if using the pre-seeded SQLite db).*

### 3. Start React (Frontend)
```bash
cd frontend
npm install
npm run dev
```
The frontend will run on `http://localhost:5173`.

### 4. CLI Scripts
Admin scripts use Python and `uv`.
| Script | Purpose |
|---|---|
| `uv run scripts/import_csv.py <file.csv>` | Import data via CLI |
| `uv run scripts/backup.py` | Create a snapshot backup |
| `uv run scripts/fix-api-rules.py` | Reapply PB schema rules |

---

## 🚀 Production Deployment Guide

Fluke is designed to be hosted cheaply and scale well using **PikaPods** (backend) and **Vercel** (frontend).

### Step 1: Deploy Backend (PikaPods)
1. Sign up at [pikapods.com](https://www.pikapods.com).
2. Click **Add Pod** → Search for **PocketBase** (latest v0.25.x).
3. The smallest CPU/RAM tier is sufficient.
4. Once running, note your pod URL (e.g., `https://fluke-db.pikapods.net`).
5. Open `https://your-pod-url/_/` and initialize your admin superuser account.

**Apply the Schema:**
Run this locally to push the Fluke schema to your new PikaPod:
```bash
PB_URL=https://your-pod-url.pikapods.net \
PB_ADMIN_EMAIL=your-admin@email.com \
PB_ADMIN_PASS=your-password \
uv run scripts/setup-schema.py
```
*(Also run `scripts/fix-api-rules.py` with the same vars to ensure secure endpoints).*

### Step 2: Deploy Frontend (Vercel)
1. Push this repository to GitHub.
2. Sign up at [vercel.com](https://vercel.com) and click **Add New → Project**.
3. Import your GitHub repository.
4. Set the **Root Directory** to `frontend`.
5. Under **Environment Variables**, add:
   - `VITE_POCKETBASE_URL` = `https://your-pod-url.pikapods.net`
6. Click **Deploy**.

### Step 3: Configure CORS
To allow Vercel to talk to PikaPods:
1. Log into your PocketBase admin UI (`https://your-pod-url/_/`).
2. Go to **Settings → Application**.
3. Add your Vercel URL (e.g., `https://fluke.vercel.app`) to the **Allowed origins** list.

### Step 4: Import Data
You can now import your ALPR `.csv` files using the **CSV Upload** tab in the Fluke admin dashboard!
