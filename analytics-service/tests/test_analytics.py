"""Tests for the analytics service using Flask's test client."""

import io
import os
import sys

import pytest

from app import create_app

SAMPLE_CSV_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "sample_data", "sales_sample.csv"
)
VALID_HEADER = b"salesperson,revenue,region\n"


@pytest.fixture()
def client():
    app = create_app()
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


def _upload(client, content, filename="sales.csv"):
    if isinstance(content, str):
        content = content.encode("utf-8")
    return client.post(
        "/analyze",
        data={"file": (io.BytesIO(content), filename)},
        content_type="multipart/form-data",
    )


def _figure_title(figure):
    title = figure.get("layout", {}).get("title")
    return title.get("text") if isinstance(title, dict) else title


def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200

    assert response.get_json() == {
        "success": True,
        "message": "Analytics service healthy",
        "data": {"status": "ok", "service": "analytics-service"},
    }


def test_analyze_sample_csv_happy_path(client):
    with open(SAMPLE_CSV_PATH, "rb") as handle:
        content = handle.read()

    response = _upload(client, content, "sales_sample.csv")
    assert response.status_code == 200

    body = response.get_json()
    assert body["success"] is True
    assert body["message"] == "Sales data analyzed successfully"

    data = body["data"]
    assert data["summary"] == {
        "totalRevenue": 72000,
        "averageRevenue": 12000,
        "highestSale": 18000,
        "lowestSale": 8000,
        "totalRecords": 6,
        "uniqueSalespeople": 3,
        "uniqueRegions": 3,
    }
    assert data["revenueByRegion"] == [
        {"region": "West", "totalRevenue": 33000},
        {"region": "East", "totalRevenue": 22000},
        {"region": "North", "totalRevenue": 17000},
    ]
    assert data["topSalespeople"] == [
        {"salesperson": "Jane", "totalRevenue": 33000},
        {"salesperson": "John", "totalRevenue": 22000},
        {"salesperson": "David", "totalRevenue": 17000},
    ]

    charts = data["charts"]
    assert set(charts) == {"revenueByRegion", "topSalespeople"}
    assert _figure_title(charts["revenueByRegion"]) == "Revenue by Region"
    assert _figure_title(charts["topSalespeople"]) == "Top Salespeople"
    for figure in charts.values():
        assert "data" in figure and "layout" in figure
        assert figure["data"][0]["type"] == "bar"


def test_revenue_by_region_is_ordered_descending(client):
    response = _upload(client, VALID_HEADER + b"A,10,North\nB,30,South\nC,20,East\n")
    assert response.status_code == 200

    regions = response.get_json()["data"]["revenueByRegion"]
    assert [row["region"] for row in regions] == ["South", "East", "North"]
    assert [row["totalRevenue"] for row in regions] == [30, 20, 10]


def test_top_salespeople_limited_to_five(client):
    rows = [VALID_HEADER.decode()]
    for index in range(8):
        rows.append(f"Person{index},{1000 + index},Region{index % 3}\n")
    response = _upload(client, "".join(rows))
    assert response.status_code == 200
    assert len(response.get_json()["data"]["topSalespeople"]) == 5


def test_missing_file_is_rejected(client):
    response = client.post("/analyze", data={}, content_type="multipart/form-data")
    assert response.status_code == 400

    body = response.get_json()
    assert body["success"] is False
    assert body["errors"][0]["field"] == "file"


def test_empty_filename_is_rejected(client):
    response = _upload(client, VALID_HEADER + b"John,10000,East\n", filename="")
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_wrong_extension_is_rejected(client):
    response = _upload(client, VALID_HEADER + b"John,10000,East\n", filename="sales.txt")
    assert response.status_code == 400

    body = response.get_json()
    assert body["success"] is False
    assert body["errors"] == [{"field": "file", "message": "Only .csv files are allowed"}]


def test_missing_columns_is_rejected(client):
    response = _upload(client, "salesperson,revenue\nJohn,10000\n")
    assert response.status_code == 422

    body = response.get_json()
    assert body["success"] is False
    assert {error["field"] for error in body["errors"]} == {"region"}


def test_empty_csv_is_rejected(client):
    response = _upload(client, VALID_HEADER)
    assert response.status_code == 422

    body = response.get_json()
    assert body["success"] is False
    assert "errors" in body


def test_non_numeric_revenue_is_rejected(client):
    response = _upload(client, VALID_HEADER + b"John,not-a-number,East\n")
    assert response.status_code == 422

    body = response.get_json()
    assert body["success"] is False
    assert body["errors"][0]["field"] == "revenue"
    assert "revenue" in body["errors"][0]["message"]


def test_negative_revenue_is_rejected(client):
    response = _upload(client, VALID_HEADER + b"John,-500,East\n")
    assert response.status_code == 422

    body = response.get_json()
    assert body["success"] is False
    assert body["errors"][0]["field"] == "revenue"
    assert "revenue" in body["errors"][0]["message"]


@pytest.mark.parametrize("value", ["inf", "-inf"])
def test_non_finite_revenue_is_rejected(client, value):
    response = _upload(client, VALID_HEADER + f"John,{value},East\n".encode())
    assert response.status_code == 422
    assert response.get_json()["errors"][0]["field"] == "revenue"


@pytest.mark.parametrize(
    ("row", "field"),
    [
        (",100,East", "salesperson"),
        ("John,100,", "region"),
        ("  ,100,East", "salesperson"),
        ("John,100,   ", "region"),
    ],
)
def test_blank_grouping_values_are_rejected(client, row, field):
    response = _upload(client, VALID_HEADER + row.encode() + b"\n")
    assert response.status_code == 422
    assert response.get_json()["errors"][0]["field"] == field


def test_oversized_file_is_rejected(client):
    rows = [VALID_HEADER.decode()]
    rows.extend(["John,10000,East\n"] * 400000)  # ~6.1 MB, above the 5 MB limit
    response = _upload(client, "".join(rows), filename="big.csv")
    assert response.status_code == 400

    body = response.get_json()
    assert body["success"] is False
    assert body["errors"][0]["field"] == "file"


def test_internal_error_returns_generic_message(client, monkeypatch):
    service = sys.modules["app.services.analytics_service"]

    def _explode(_dataframe):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(service, "analyze_sales_data", _explode)

    response = _upload(client, VALID_HEADER + b"John,10000,East\n")
    assert response.status_code == 500

    body = response.get_json()
    assert body == {"success": False, "message": "Internal server error"}
    assert "kaboom" not in response.get_data(as_text=True)
