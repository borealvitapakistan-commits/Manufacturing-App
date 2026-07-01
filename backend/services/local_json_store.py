from __future__ import annotations

import json
from threading import RLock
from typing import Any

from django.conf import settings


class LocalJSONStore:
    _lock = RLock()

    def __init__(self, relative_path: str, default: Any):
        self.path = settings.BASE_DIR.parent / "data" / relative_path
        self.default = default

    def _ensure_file(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.write(self.default)

    def read(self) -> Any:
        with self._lock:
            self._ensure_file()
            try:
                return json.loads(self.path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return self.default

    def write(self, value: Any) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps(value, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
