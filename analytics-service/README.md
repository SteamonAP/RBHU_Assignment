# Analytics Service

A small **Python + Flask + Pandas + Plotly** microservice for the LogiOps logistics
operations platform. It accepts an uploaded CSV of sales records and returns descriptive
revenue analytics plus ready-to-render Plotly figure JSON.

This service is purely descriptive: there is **no machine learning, no model training and
no scikit-learn / TensorFlow** anywhere. It only performs classic aggregation with Pandas
and chart building with Plotly.

## What it does

- Validates an uploaded `.csv` file (extension, size, required columns, values).
- Loads the CSV into a Pandas DataFrame.
- Computes a revenue summary, revenue per region and the top salespeople.
- Builds two Plotly **bar** charts and returns them as plain JSON objects that a frontend
  can pass straight to a Plotly renderer (for example `react-plotly.js`).

## Requirements

- Python 3.12
- Dependencies: `flask`, `flask-cors`, `pandas`, `plotly`, `gunicorn`, `python-dotenv`,
  and `pytest` (tests only)

## Setup

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

```bash
# bash equivalent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` to override the defaults.

## Running

```powershell
.venv\Scripts\python.exe run.py
```

The service listens on `http://0.0.0.0:5001` by default.

Production (WSGI):

```bash
gunicorn "app:create_app()" --bind 0.0.0.0:5001
```

### Configuration

| Env var            | Default                 | Description                          |
| ------------------ | ----------------------- | ------------------------------------ |
| `PORT`             | `5001`                  | Port used by `run.py`                |
| `MAX_FILE_SIZE_MB` | `5`                     | Maximum accepted upload size (MB)    |
| `CORS_ORIGIN`      | `http://localhost:5173` | Allowed CORS origin                  |

## Expected CSV schema

The uploaded file **must** have a header row containing the columns
`salesperson`, `revenue` and `region` (extra columns are ignored):

```csv
salesperson,revenue,region
John,10000,East
Jane,15000,West
John,12000,East
Jane,18000,West
David,8000,North
David,9000,North
```

- `salesperson` - name of the salesperson (string)
- `revenue` - non-negative number
- `region` - region name (string)

A ready-to-use sample lives at `sample_data/sales_sample.csv`.

## Endpoints

### `GET /health`

```bash
curl http://localhost:5001/health
```

```json
{
  "success": true,
  "message": "Analytics service healthy",
  "data": { "status": "ok", "service": "analytics-service" }
}
```

### `POST /analyze`

`multipart/form-data` with the CSV in a field named `file`.

```bash
curl -X POST http://localhost:5001/analyze -F "file=@sample_data/sales_sample.csv"
```

Sample response (HTTP 200):

```json
{
  "success": true,
  "message": "Sales data analyzed successfully",
  "data": {
    "summary": {
      "totalRevenue": 72000,
      "averageRevenue": 12000,
      "highestSale": 18000,
      "lowestSale": 8000,
      "totalRecords": 6,
      "uniqueSalespeople": 3,
      "uniqueRegions": 3
    },
    "revenueByRegion": [
      { "region": "West", "totalRevenue": 33000 },
      { "region": "East", "totalRevenue": 22000 },
      { "region": "North", "totalRevenue": 17000 }
    ],
    "topSalespeople": [
      { "salesperson": "Jane", "totalRevenue": 33000 },
      { "salesperson": "John", "totalRevenue": 22000 },
      { "salesperson": "David", "totalRevenue": 17000 }
    ],
    "charts": {
      "revenueByRegion": { "data": [ "..." ], "layout": { "title": { "text": "Revenue by Region" } } },
      "topSalespeople": { "data": [ "..." ], "layout": { "title": { "text": "Top Salespeople" } } }
    }
  }
}
```

Rules:

- `revenueByRegion` groups by region, sums revenue and is ordered by total revenue
  descending.
- `topSalespeople` groups by salesperson, sums revenue, is ordered descending and is
  limited to the top 5 (fewer if fewer exist).
- All numbers are plain JSON numbers (never numpy types).
- `charts.*` are real Plotly figure dictionaries (`plotly.graph_objects` bar charts)
  serialised with `plotly.io.to_json`. They are returned as JSON, **not** as PNG files.

### Error responses

Errors always use the envelope `{ "success": false, "message": "...", "errors": [ ... ] }`.

| Case                                        | Status |
| ------------------------------------------- | ------ |
| Missing `file` field / empty filename       | `400`  |
| Extension other than `.csv`                  | `400`  |
| File larger than `MAX_FILE_SIZE_MB`          | `400`  |
| Missing required columns                     | `422`  |
| Empty CSV / no data rows                     | `422`  |
| Non-numeric or negative revenue              | `422`  |
| Unexpected server error                      | `500`  |

Example error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "file", "message": "Only .csv files are allowed" }]
}
```

For an unexpected server error the response is a generic `500` and the real exception is
logged server-side only - a stack trace is never returned to the client.

## Tests

```powershell
.venv\Scripts\python.exe -m pytest tests -v
```

```bash
python -m pytest tests -v
```
