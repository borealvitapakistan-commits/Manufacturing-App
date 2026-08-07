"""Django API settings."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}

def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "development-only-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver")
# Vercel injects VERCEL_URL with the deployment's own hostname (preview and
# production alike) - trust it automatically so ALLOWED_HOSTS doesn't need
# to be hand-maintained per deployment.
if os.getenv("VERCEL_URL"):
    ALLOWED_HOSTS.append(os.environ["VERCEL_URL"])
if not DEBUG and SECRET_KEY == "development-only-change-me":
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=false.")


# Application definition

INSTALLED_APPS = [
    "rest_framework",
    "corsheaders",
    "apps.common",
    "apps.commercial",
    "apps.inventory",
    "apps.manufacturing",
    "apps.reports",
    "apps.invoices_purchase_orders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES: list[dict] = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Django's ORM is intentionally disabled.
DATABASES: dict = {}


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS: list[dict] = []


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "Asia/Karachi")

USE_I18N = True

USE_TZ = True


CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
# Same reasoning as ALLOWED_HOSTS above: on Vercel the frontend and this API
# are served from the same deployment/domain, so this is normally same-origin
# and CORS doesn't even apply - this is just a safety net for preview URLs.
if os.getenv("VERCEL_URL"):
    CORS_ALLOWED_ORIGINS.append(f"https://{os.environ['VERCEL_URL']}")
CORS_ALLOWED_ORIGIN_REGEXES = env_list("CORS_ALLOWED_ORIGIN_REGEXES", "")
if DEBUG and not CORS_ALLOWED_ORIGIN_REGEXES:
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^http://localhost:517[0-9]$",
        r"^http://127\.0\.0\.1:517[0-9]$",
    ]
CORS_ALLOW_CREDENTIALS = False

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.common.authentication.SupabaseBearerAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
}

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = (
    os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
)
SUPABASE_REQUIRE_AUTH = env_bool("SUPABASE_REQUIRE_AUTH", not DEBUG)
SUPABASE_TRUST_ENV_PROXY = env_bool("SUPABASE_TRUST_ENV_PROXY", False)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SECURE_HSTS_SECONDS = int(
    os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000" if not DEBUG else "0")
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
X_FRAME_OPTIONS = "DENY"

APPEND_SLASH = True
