"""Pure business logic for the sales analytics service.

This module has no Flask imports: it takes a file-like CSV or a
:class:`pandas.DataFrame` and returns plain Python structures, which keeps it
trivially unit-testable and reusable outside the HTTP layer.
"""

import json
import math
from typing import Any

import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio

from app.utils.errors import ApiError
from app.utils.validation import REQUIRED_COLUMNS

TOP_SALESPEOPLE_LIMIT = 5


def _to_number(value: Any):
    """Return a plain JSON number: an ``int`` when whole, otherwise a 2-decimal float.

    Guarantees no numpy scalar types leak into the JSON response.
    """
    rounded = round(float(value), 2)
    if rounded.is_integer():
        return int(rounded)
    return rounded


def load_dataframe(stream) -> pd.DataFrame:
    """Read a CSV from a file-like object into a DataFrame.

    Raises :class:`ApiError` (HTTP 422) when the stream is empty or unparsable.
    """
    try:
        return pd.read_csv(stream)
    except pd.errors.EmptyDataError as exc:
        raise ApiError(
            "Validation failed",
            [{"field": "file", "message": "The uploaded CSV is empty"}],
            status_code=422,
        ) from exc
    except pd.errors.ParserError as exc:
        raise ApiError(
            "Validation failed",
            [{"field": "file", "message": "The uploaded file is not a valid CSV"}],
            status_code=422,
        ) from exc


def _validate_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Validate columns/rows/revenue and return the frame with numeric revenue."""
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing_columns:
        raise ApiError(
            "Validation failed",
            [
                {"field": column, "message": f"Missing required column: {column}"}
                for column in missing_columns
            ],
            status_code=422,
        )

    if len(df.index) == 0:
        raise ApiError(
            "Validation failed",
            [{"field": "file", "message": "The CSV must contain at least one data row"}],
            status_code=422,
        )

    revenue = pd.to_numeric(df["revenue"], errors="coerce")

    non_numeric = revenue.isna()
    if non_numeric.any():
        offenders = df.loc[non_numeric, "revenue"].astype(str).unique().tolist()
        raise ApiError(
            "Validation failed",
            [
                {"field": "revenue", "message": f"Non-numeric value in column 'revenue': {value}"}
                for value in offenders
            ],
            status_code=422,
        )

    non_finite = ~revenue.map(lambda value: math.isfinite(float(value)))
    if non_finite.any():
        raise ApiError(
            "Validation failed",
            [
                {"field": "revenue", "message": "Revenue values must be finite numbers"}
            ],
            status_code=422,
        )

    negative = revenue < 0
    if negative.any():
        offenders = [float(value) for value in revenue[negative].tolist()]
        raise ApiError(
            "Validation failed",
            [
                {"field": "revenue", "message": f"Negative value in column 'revenue': {value}"}
                for value in offenders
            ],
            status_code=422,
        )

    df = df.copy()
    df["revenue"] = revenue
    for column in ("salesperson", "region"):
        values = df[column].astype("string").str.strip()
        if values.isna().any() or values.eq("").any():
            raise ApiError(
                "Validation failed",
                [
                    {
                        "field": column,
                        "message": f"Column '{column}' must not contain empty values",
                    }
                ],
                status_code=422,
            )
        df[column] = values
    return df


def build_plotly_figures(revenue_by_region: list, top_salespeople: list) -> dict:
    """Build the two bar charts as plain (react-plotly.js compatible) JSON dicts."""
    region_figure = go.Figure(
        data=[
            go.Bar(
                x=[row["region"] for row in revenue_by_region],
                y=[row["totalRevenue"] for row in revenue_by_region],
                name="Revenue",
            )
        ]
    )
    region_figure.update_layout(
        title="Revenue by Region",
        xaxis_title="Region",
        yaxis_title="Total Revenue",
    )

    salespeople_figure = go.Figure(
        data=[
            go.Bar(
                x=[row["salesperson"] for row in top_salespeople],
                y=[row["totalRevenue"] for row in top_salespeople],
                name="Revenue",
            )
        ]
    )
    salespeople_figure.update_layout(
        title="Top Salespeople",
        xaxis_title="Salesperson",
        yaxis_title="Total Revenue",
    )

    return {
        "revenueByRegion": json.loads(pio.to_json(region_figure)),
        "topSalespeople": json.loads(pio.to_json(salespeople_figure)),
    }


def analyze_sales_data(df: pd.DataFrame) -> dict:
    """Compute the full analytics payload from a sales dataframe.

    Expects the columns ``salesperson``, ``revenue`` and ``region``.
    """
    df = _validate_dataframe(df)

    summary = {
        "totalRevenue": _to_number(df["revenue"].sum()),
        "averageRevenue": _to_number(df["revenue"].mean()),
        "highestSale": _to_number(df["revenue"].max()),
        "lowestSale": _to_number(df["revenue"].min()),
        "totalRecords": int(len(df.index)),
        "uniqueSalespeople": int(df["salesperson"].nunique()),
        "uniqueRegions": int(df["region"].nunique()),
    }

    region_totals = (
        df.groupby("region", as_index=False)["revenue"]
        .sum()
        .sort_values("revenue", ascending=False)
    )
    revenue_by_region = [
        {"region": row["region"], "totalRevenue": _to_number(row["revenue"])}
        for _, row in region_totals.iterrows()
    ]

    salesperson_totals = (
        df.groupby("salesperson", as_index=False)["revenue"]
        .sum()
        .sort_values("revenue", ascending=False)
        .head(TOP_SALESPEOPLE_LIMIT)
    )
    top_salespeople = [
        {"salesperson": row["salesperson"], "totalRevenue": _to_number(row["revenue"])}
        for _, row in salesperson_totals.iterrows()
    ]

    return {
        "summary": summary,
        "revenueByRegion": revenue_by_region,
        "topSalespeople": top_salespeople,
        "charts": build_plotly_figures(revenue_by_region, top_salespeople),
    }
