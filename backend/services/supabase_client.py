from functools import lru_cache

import httpx
from django.conf import settings
from supabase import Client, ClientOptions, create_client


class SupabaseConfigurationError(RuntimeError):
    pass


def is_supabase_configured() -> bool:
    return credential_mode() != "missing"


def credential_mode() -> str:
    if not settings.SUPABASE_URL:
        return "missing"
    if settings.SUPABASE_SERVICE_ROLE_KEY:
        return "service_role"
    if settings.DEBUG and settings.SUPABASE_ANON_KEY:
        return "publishable_development"
    return "missing"


@lru_cache(maxsize=4)
def _create_supabase(url: str, key: str, trust_env_proxy: bool) -> Client:
    transport = httpx.HTTPTransport(retries=3)
    http_client = httpx.Client(
        transport=transport,
        trust_env=trust_env_proxy,
        timeout=httpx.Timeout(15),
    )
    return create_client(
        url,
        key,
        options=ClientOptions(httpx_client=http_client),
    )


def get_supabase() -> Client:
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    if not key and settings.DEBUG:
        key = settings.SUPABASE_ANON_KEY
    if not url or not key:
        raise SupabaseConfigurationError(
            "Supabase is not configured. Copy backend/.env.example to backend/.env "
            "and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. A publishable-key "
            "fallback is permitted only while DJANGO_DEBUG=true."
        )
    return _create_supabase(
        url,
        key,
        settings.SUPABASE_TRUST_ENV_PROXY,
    )
