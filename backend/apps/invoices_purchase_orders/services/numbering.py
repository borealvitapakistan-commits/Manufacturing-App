from __future__ import annotations

import re

from services.base_service import ServiceError


def derive_number(source_number: str | None, from_segment: str, to_segment: str, *, label: str) -> str:
    """Rewrites a document number's segment, keeping the brand prefix and
    sequence digits exactly as they are on the source document - e.g.
    BOR-RTQ-004 -> BOR-Q-004 (from_segment "RTQ", to_segment "Q"), or
    BOR-PO-004 -> BOR-PO-PP-004 (from_segment "PO", to_segment "PO-PP").

    The whole point of a Quote/PO/Invoice/Payment-Proof number is that it
    traces back to the originating Request to Quote at a glance, so these
    are never independently generated once a parent document number exists.
    """
    match = re.match(rf"^(.+)-{re.escape(from_segment)}-(\d+)$", source_number or "")
    if not match:
        raise ServiceError(
            f"Could not derive a {label} number from '{source_number}' - "
            f"expected a number ending in -{from_segment}-<digits>.",
            400,
        )
    prefix, seq = match.group(1), match.group(2)
    return f"{prefix}-{to_segment}-{seq}"


__all__ = ["derive_number"]
