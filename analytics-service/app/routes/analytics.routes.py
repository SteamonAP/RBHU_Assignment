"""HTTP blueprint exposing the analytics endpoints.

Blueprint name: ``analytics``
Routes:
    GET  /health
    POST /analyze
"""

import importlib.util
import os
import sys

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import HTTPException

from app.utils.errors import ApiError, error_response, success_response
from app.utils.validation import allowed_file, validate_file_size

SERVICE_NAME = "analytics-service"


def _load_service_module():
    """Load ``services/analytics.service.py``.

    The module file name contains a dot (mandated by the project layout), so it
    cannot be referenced with normal import syntax and is loaded directly.
    """
    module_name = "app.services.analytics_service"
    if module_name in sys.modules:
        return sys.modules[module_name]

    module_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "services",
        "analytics.service.py",
    )
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_service = _load_service_module()

bp = Blueprint("analytics", __name__)


@bp.get("/health")
def health():
    """Liveness probe."""
    return (
        jsonify(
            success_response(
                "Analytics service healthy",
                {"status": "ok", "service": SERVICE_NAME},
            )
        ),
        200,
    )


@bp.post("/analyze")
def analyze():
    """Validate the uploaded CSV, delegate the analysis, return the JSON payload."""
    try:
        if "file" not in request.files:
            raise ApiError(
                "Validation failed",
                [{"field": "file", "message": "No file was provided"}],
                status_code=400,
            )

        uploaded_file = request.files["file"]

        if not uploaded_file or uploaded_file.filename == "":
            raise ApiError(
                "Validation failed",
                [{"field": "file", "message": "The uploaded file has no filename"}],
                status_code=400,
            )

        if not allowed_file(uploaded_file.filename):
            raise ApiError(
                "Validation failed",
                [{"field": "file", "message": "Only .csv files are allowed"}],
                status_code=400,
            )

        uploaded_file.stream.seek(0, os.SEEK_END)
        file_size = uploaded_file.stream.tell()
        uploaded_file.stream.seek(0)
        validate_file_size(file_size, current_app.config["MAX_FILE_SIZE_MB"])

        dataframe = _service.load_dataframe(uploaded_file.stream)
        result = _service.analyze_sales_data(dataframe)

        return jsonify(success_response("Sales data analyzed successfully", result)), 200

    except ApiError as exc:
        return jsonify(error_response(exc.message, exc.errors)), exc.status_code
    except HTTPException:
        # e.g. RequestEntityTooLarge raised while parsing an oversized body:
        # let Flask's registered handlers shape the response envelope.
        raise
    except Exception:  # noqa: BLE001 - never leak internals; logged for diagnosis
        current_app.logger.exception("Unexpected error while analyzing the uploaded file")
        return jsonify(error_response("Internal server error")), 500
