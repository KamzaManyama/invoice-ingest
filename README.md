# Supplier Invoice Ingest

A full-stack web application for ingesting supplier invoices from CSV files. Validates each row against South African business rules, stores valid records in MySQL, and sends Gmail alert emails after every run.

**Live Demo:** https://yourusername.github.io/your-repo

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, Tailwind CSS, Vanilla JS |
| Backend | Node.js, Express |
| Database | MySQL |
| Email | Gmail OAuth2 + Nodemailer |
| Hosting | GitHub Pages (frontend) + Render (backend) |

---

## Features

- Drag and drop CSV upload
- Row-by-row validation with clear error messages
- Automatic VAT calculation (15% South African default)
- Duplicate invoice detection
- Gmail attachment polling (background trigger)
- Webhook endpoint for external systems
- Dry run mode — validate without writing to the database
- Email alert after every ingest run
- Live invoice records table with search and filters

---

## Project Structure

```
├── client/
│   └── index.html          # Frontend dashboard (GitHub Pages)
└── server/
    ├── src/
    │   ├── config/
    │   │   ├── db.js         # MySQL connection pool
    │   │   └── gmailAuth.js  # Gmail OAuth2 client
    │   ├── jobs/
    │   │   └── gmailPoller.js  # Gmail attachment poller
    │   ├── middleware/
    │   │   ├── errorHandler.js
    │   │   └── upload.js
    │   ├── routes/
    │   │   ├── ingest.js     # POST /api/ingest
    │   │   └── invoices.js   # GET /api/invoices, /stats
    │   ├── services/
    │   │   ├── emailService.js
    │   │   ├── ingestPipeline.js
    │   │   ├── invoiceService.js
    │   │   └── validator.js
    │   ├── utils/
    │   │   └── csvParser.js
    │   └── index.js
    ├── .env.example
    └── package.json
```

---

## Local Development

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/your-repo.git
cd your-repo/server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Fill in your values:

```env
PORT=3001
DB_HOST=your_db_host
DB_PORT=3306
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
CORS_ORIGIN=http://localhost:5500
```

### 4. Start the server

```bash
npm run dev
```

### 5. Open the frontend

Open `client/index.html` with Live Server or any static file server.

---

## Deployment

### Backend → Render

1. Push repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Configure:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |

5. Add environment variables in the Render dashboard (same as `.env` but with your production values)
6. Set `CORS_ORIGIN` to your GitHub Pages URL

### Frontend → GitHub Pages

1. Update `const API` in `client/index.html` to your Render URL:
```js
const API = 'https://your-app.onrender.com/api';
```
2. Go to repo **Settings → Pages → Source → main branch**
3. Your dashboard is live at `https://yourusername.github.io/your-repo`

---

## CSV Format

### Required columns

| Column | Format | Example |
|---|---|---|
| `supplier_number` | Text | `S001` |
| `supplier_name` | Text | `Acme Supplies` |
| `invoice_number` | Text | `ACM-1001` |
| `department` | Text | `Operations` |
| `invoice_date` | YYYY-MM-DD | `2025-01-15` |
| `amount_excl` | Number | `5000.00` |

### Optional columns

| Column | Default | Notes |
|---|---|---|
| `vat_rate` | `15` | South African VAT |
| `vat` | Calculated | `amount_excl × vat_rate / 100` |
| `amount_incl` | Calculated | `amount_excl + vat` |

### Example

```csv
supplier_number,supplier_name,invoice_number,department,invoice_date,amount_excl,vat_rate
S001,Acme Supplies,ACM-1001,Operations,2025-01-15,5000.00,15
S002,Bold Stationery,BST-2201,HR,2025-03-05,850.00,15
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/ingest` | Upload CSV file |
| `GET` | `/api/invoices` | List invoices |
| `GET` | `/api/invoices/stats` | Aggregate counts |

### POST /api/ingest

```bash
# Standard upload
curl -X POST https://your-app.onrender.com/api/ingest \
  -F "file=@invoices.csv"

# Dry run
curl -X POST "https://your-app.onrender.com/api/ingest?dryRun=true" \
  -F "file=@invoices.csv"
```

---

## Database Schema

```sql
CREATE TABLE supplier_invoices (
  id               CHAR(36)      NOT NULL,
  invoice_number   VARCHAR(255)  NOT NULL,
  supplier_number  VARCHAR(255)  NOT NULL,
  supplier_name    VARCHAR(255)  NOT NULL,
  department       VARCHAR(255)  NOT NULL,
  amount_excl_vat  DECIMAL(12,2) NOT NULL,
  vat              DECIMAL(12,2) NOT NULL,
  amount_incl_vat  DECIMAL(12,2) NOT NULL,
  invoice_date     DATE          NOT NULL,
  source_file_name VARCHAR(500)  DEFAULT NULL,
  source_hash      VARCHAR(64)   DEFAULT NULL,
  ingest_timestamp TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status           ENUM('inserted','duplicate','failed') NOT NULL,
  validation_notes TEXT,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_invoice (supplier_number, invoice_number)
);
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3001`) |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port (default `3306`) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `CORS_ORIGIN` | Allowed frontend URL |
| `GMAIL_CLIENT_ID` | Gmail OAuth2 client ID |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth2 refresh token |
| `GMAIL_USER` | Gmail address |
| `ALERT_TO` | Alert recipient email |
| `DRY_RUN` | Skip DB writes (`true`/`false`) |
| `TIMEZONE` | Date validation timezone (default `Africa/Johannesburg`) |
