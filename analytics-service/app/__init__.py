"""Flask application factory for the Sales Analytics microservice."""

import importlib.util
import logging
import os
import sys

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from app.utils.errors import error_response

DEFAULT_PORT = 5001
DEFAULT_MAX_FILE_SIZE_MB = 5
DEFAULT_CORS_ORIGIN = "http://localhost:5173"


def _int_env(name: str, default: int) -> int:
    """Read an integer environment variable, falling back to ``default``."""
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _load_blueprint():
    """Load the analytics blueprint from ``routes/analytics.routes.py``.

    The file name contains a dot (mandated by the project layout) and therefore
    cannot be referenced with normal import syntax, so it is loaded directly.
    """
    module_name = "app.routes.analytics_routes"
    if module_name in sys.modules:
        return sys.modules[module_name].bp

    module_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "routes",
        "analytics.routes.py",
    )
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.bp


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(404)
    def _not_found(_error):
        return jsonify(error_response("Resource not found")), 404

    @app.errorhandler(405)
    def _method_not_allowed(_error):
        return jsonify(error_response("Method not allowed")), 405

    @app.errorhandler(413)
    def _payload_too_large(_error):
        # Flask rejects bodies above MAX_CONTENT_LENGTH with 413 before the view
        # runs; surface it as a 400 validation error for a consistent envelope.
        max_size_mb = app.config["MAX_FILE_SIZE_MB"]
        return (
            jsonify(
                error_response(
                    "Validation failed",
                    [
                        {
                            "field": "file",
                            "message": f"File is too large; the maximum allowed size is {max_size_mb} MB",
                        }
                    ],
                )
            ),
            400,
        )

    @app.errorhandler(500)
    def _internal_error(_error):
        return jsonify(error_response("Internal server error")), 500


def create_app() -> Flask:
    """Create and configure a Flask application instance."""
    load_dotenv()

    app = Flask(__name__)

    max_size_mb = _int_env("MAX_FILE_SIZE_MB", DEFAULT_MAX_FILE_SIZE_MB)
    app.config.update(
        MAX_FILE_SIZE_MB=max_size_mb,
        MAX_CONTENT_LENGTH=max_size_mb * 1024 * 1024,
        CORS_ORIGIN=os.getenv("CORS_ORIGIN", DEFAULT_CORS_ORIGIN),
        PORT=_int_env("PORT", DEFAULT_PORT),
    )

    logging.basicConfig(level=logging.INFO)

    CORS(app, resources={r"/*": {"origins": app.config["CORS_ORIGIN"]}})

    app.register_blueprint(_load_blueprint())

    _register_error_handlers(app)

    return app
