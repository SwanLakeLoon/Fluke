# Fluke

**Open-source ALPR data explorer** — its just a Fluke!

A web application for searching, importing, and managing ALPR (Automated License Plate Reader) data in the Twin Cities metro area (and beyond)!

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

---

---

## 🚀 Production Deployment Guide

Fluke is designed to be hosted cheaply using **PikaPods** (backend) and **Vercel** (frontend).

> **Important:** The PocketBase *superuser* account (used to manage the database) is completely separate from the Fluke *app user* account (used to log into the Fluke web UI). You will create both.

---

### Step 1: Deploy PocketBase to PikaPods

1. Sign up at [pikapods.com](https://www.pikapods.com).
2. Click **Add Pod** → search for **PocketBase** (v0.25.x). The smallest tier is fine.
3. Once the pod is running, note your pod URL (e.g., `https://your-pod.pikapods.net`).

**Create your PocketBase superuser (PikaPods v0.23+ process):**

PikaPods does not prompt you to create an admin — instead, the one-time setup URL is hidden in your pod logs.

1. In the PikaPods dashboard, click your pod → **More → Show Logs**
2. Look for a line containing a URL that starts with:
   ```
   http://0.0.0.0:8090/_/#/pbinstal/
   ```
   followed by a long JWT token.
3. Copy that URL and replace `http://0.0.0.0:8090` with your actual pod URL:
   ```
   https://your-pod.pikapods.net/_/#/pbinstal/<jwt-token>
   ```
4. Open that modified URL in your browser and create your superuser account.
5. **Save these credentials somewhere safe** — you will need them for every admin operation.

**Update the Application URL:**

Once logged into your PocketBase admin panel (`https://your-pod.pikapods.net/_/`):

1. Go to **Settings → Application**
2. Change **Application URL** from `http://localhost:8090` to `https://your-pod.pikapods.net`
3. Click **Save changes**

---

### Step 2: Apply the Fluke Schema

Run these two scripts locally, pointing them at your live pod.

Run the unified initialization script locally, pointing it at your live pod. This script securely provisions the entire 3-tier database structure, creates all SQL views, and applies strict API rule assignments sequentially.

```bash
# Safely initialize the unified 3-tier schema and security rules
POCKETBASE_URL=https://your-pod.pikapods.net \
PB_ADMIN_EMAIL=your-superuser@email.com \
PB_ADMIN_PASS=your-superuser-password \
uv run scripts/setup-schema.py
```

When successful, you will see output confirming collections like `vins`, `vehicles`, `sightings`, and `enhanced_vin_stats` have been created or updated. If you see repeated API errors, double-check your credentials and ensure the `POCKETBASE_URL` env var string is completely accurate without a trailing slash.

---

### Step 3: Create a Fluke App User

The PocketBase superuser is only for database administration. You need a separate user account to log into the Fluke web UI.

1. In your PocketBase admin panel → **Collections → users → New record**
2. Fill in:
   - **username** — e.g. `admin` (this is what you type into the Fluke login screen)
   - **email** — your email address
   - **password** + **passwordConfirm** — choose a secure password
   - **role** — select `admin`
3. Save the record.

---

### Step 4: Deploy Frontend to Vercel

> ⚠️ **Critical:** Vite bakes environment variables into the bundle **at build time**. The `VITE_POCKETBASE_URL` variable **must be set in Vercel before the first deploy**, or the app will point to `localhost` and logins will fail.

1. Push this repo to GitHub.
2. Sign into [vercel.com](https://vercel.com) and click **Add New → Project**.
3. Import your GitHub repo. Select **GitHub** as the Git provider.
4. In the project configuration:
   - Find **Root Directory** under *Build and Output Settings* and set it to `frontend`
   - Under **Environment Variables**, add **before clicking Deploy**:

   | Key | Value |
   |---|---|
   | `VITE_POCKETBASE_URL` | `https://your-pod.pikapods.net` |

5. Click **Deploy**.

If you forget the env var and deploy first, add it in **Settings → Environment Variables** afterward, then go to **Deployments → ··· → Redeploy** to trigger a fresh build.

---

### Step 5: Smoke Test

| Check | Expected result |
|---|---|
| Visit your Vercel URL | Fluke login page appears |
| Log in with your app user | Redirected to search page |
| DevTools console has no errors | No `127.0.0.1` or CORS errors |
| Admin → Records | Collections visible, table loads |
| Admin → Upload CSV | Upload and import works |

---

### Step 6: Import Data

Upload ALPR `.csv` files using the **CSV Upload** tab in the Fluke admin dashboard, OR via CLI:

```bash
POCKETBASE_URL=https://your-pod.pikapods.net \
PB_ADMIN_EMAIL=your-superuser@email.com \
PB_ADMIN_PASS=your-superuser-password \
uv run scripts/import_csv.py ./data/your-file.csv
```

---

### Redeploying After Code Changes

Every `git push` to `main` will automatically trigger a new Vercel deploy. No action needed.

For PocketBase schema changes, simply re-run the unified `setup-schema.py` script against the production pod URL to gracefully apply new collections or rule modifications.

---

## 🔄 Nightly ICE Status Refresh (GitHub Actions)

Fluke runs a nightly job that re-checks every known plate against the `defrostmn.net` database and updates any vehicles whose ICE status has changed. When an admin next logs in, a banner shows which plates changed.

### How it works

1. GitHub Actions triggers at **4:00 AM CST** (`0 10 * * *` UTC) every night
2. `scripts/ice_refresh.py` fetches all plates from PocketBase
3. Each plate is checked against `defrostmn.net/plates/lookup`
4. Changed plates → all sightings updated, vehicle `searchable` flag updated, change logged to `ice_change_log`
5. On next admin login → dismissible notification banner

### One-time Setup (Human — do once)

Add these four secrets to **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `POCKETBASE_URL` | `https://your-pod.pikapods.net` |
| `PB_ADMIN_EMAIL` | Your PocketBase superuser email |
| `PB_ADMIN_PASS` | Your PocketBase superuser password |
| `DEFROST_PASSWORD` | The defrost API shared password |

### Triggering Manually

Go to **GitHub → Actions → Nightly ICE Refresh → Run workflow** to trigger a manual run and verify the output before relying on the schedule.

### Adjusting the schedule

Edit `.github/workflows/ice-refresh.yml` and change the cron expression:

```yaml
- cron: '0 10 * * *'   # 4:00 AM CST — adjust as needed
```

[Cron expression reference](https://crontab.guru)

### Monitoring

Every run (success or failure) is logged in **GitHub → Actions → Nightly ICE Refresh**. The output shows:
- How many plates were checked
- How many changed
- Any errors or skipped plates
