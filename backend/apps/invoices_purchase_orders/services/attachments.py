from __future__ import annotations

import base64
import os

from services.base_service import ServiceError

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".txt"}
MAX_FILE_SIZE = 10 * 1024 * 1024


def validate_file(file) -> None:
    name = getattr(file, "name", "") or ""
    extension = os.path.splitext(name)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ServiceError(
            f"Unsupported file type {extension or '(none)'} - allowed: "
            + ", ".join(sorted(ALLOWED_EXTENSIONS)),
            400,
        )
    size = getattr(file, "size", None)
    if size is not None and size > MAX_FILE_SIZE:
        raise ServiceError("File is too large - the maximum size is 10MB.", 400)


def encode(file) -> str:
    """Reads and base64-encodes an uploaded file for storage in a text column."""
    validate_file(file)
    return base64.b64encode(file.read()).decode("ascii")


def data_url(file_data: str | None, content_type: str | None) -> str | None:
    if not file_data:
        return None
    return f"data:{content_type or 'application/octet-stream'};base64,{file_data}"


def renamed(file, code: str) -> str:
    """Builds the stored file name from a derived document code, keeping the
    uploaded file's original extension - e.g. code BOR-Q-004 + a "scan.pdf"
    upload becomes "BOR-Q-004.pdf".
    """
    extension = os.path.splitext(getattr(file, "name", "") or "")[1].lower()
    return f"{code}{extension}"


__all__ = ["ALLOWED_EXTENSIONS", "MAX_FILE_SIZE", "validate_file", "encode", "data_url", "renamed"]
