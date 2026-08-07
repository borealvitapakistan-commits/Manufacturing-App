"""Vercel Python serverless entrypoint.

Vercel's Python runtime (@vercel/python) auto-detects a WSGI-callable
module-level variable named ``app`` in this file and wraps it as a
serverless function. This just re-exports the existing Django WSGI
application from config/wsgi.py - nothing about the Django app itself
changes for serverless; it already talks to Supabase over HTTPS per
request rather than a local database, so there's no persistent
connection/state to worry about between invocations.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from config.wsgi import application as app  # noqa: E402
