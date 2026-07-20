"""Azure Blob Storage access for question media (images).

Question images are kept in a **private** blob container. The backend is chosen
automatically from configuration:

* a **connection string** (local dev against Azurite) — signed URLs are made
  with the account key parsed from the connection string;
* an **account URL** (Azure) — the process authenticates with its **managed
  identity** via ``DefaultAzureCredential`` and signs URLs with a
  *user-delegation* key, so no account key or connection secret is needed.

Blobs are content-addressed under an exam prefix
(``exams/{exam_id}/{sha256}.{ext}``): re-uploading the same image is idempotent
and deleting an exam is a single prefix delete. Images are served through
short-lived read-only SAS URLs, so the browser fetches them straight from Blob
Storage without the API carrying the bytes.
"""

from __future__ import annotations

import contextlib
import datetime as dt
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import (
    BlobSasPermissions,
    ContentSettings,
    UserDelegationKey,
    generate_blob_sas,
)
from azure.storage.blob.aio import BlobServiceClient

from app.core.config import Settings, get_settings

_UNCONFIGURED_MSG = (
    "Media storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING "
    "(local/Azurite) or AZURE_STORAGE_ACCOUNT_URL (Azure managed identity)."
)
# Small clock-skew allowance so a freshly minted SAS is valid immediately.
_SKEW = dt.timedelta(minutes=5)


@dataclass(frozen=True)
class MediaUpload:
    """A blob the importer wants stored: its path, bytes and content type."""

    blob_path: str
    data: bytes
    content_type: str


class MediaStorageError(RuntimeError):
    """Raised when media storage is used but has not been configured."""


class MediaStorage(ABC):
    """Stores question images and serves them via short-lived signed URLs."""

    @abstractmethod
    async def upload(self, upload: MediaUpload) -> None: ...

    @abstractmethod
    async def delete_prefix(self, prefix: str) -> None: ...

    @abstractmethod
    async def signed_url(self, blob_path: str) -> str: ...

    async def aclose(self) -> None:
        """Release any held network resources (overridden where needed)."""
        return None


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _parse_connection_string(conn: str) -> dict[str, str]:
    """Parse a Storage connection string into its key/value segments.

    Splitting on ``;`` is safe: the base64 account key may contain ``=`` (kept by
    partitioning on the first ``=``) but never ``;``.
    """
    parts: dict[str, str] = {}
    for segment in conn.split(";"):
        if "=" in segment:
            key, _, value = segment.partition("=")
            parts[key.strip()] = value.strip()
    return parts


class _AzureBlobStorage(MediaStorage):
    """Shared upload/delete/serve logic; SAS signing differs per backend."""

    def __init__(
        self, service: BlobServiceClient, container: str, settings: Settings
    ) -> None:
        self._service = service
        self._container = container
        self._settings = settings
        self._container_ready = False

    async def _ensure_container(self) -> None:
        if self._container_ready:
            return
        with contextlib.suppress(ResourceExistsError):
            await self._service.create_container(self._container)
        self._container_ready = True

    async def upload(self, upload: MediaUpload) -> None:
        await self._ensure_container()
        blob = self._service.get_blob_client(self._container, upload.blob_path)
        await blob.upload_blob(
            upload.data,
            overwrite=True,
            content_settings=ContentSettings(content_type=upload.content_type),
        )

    async def delete_prefix(self, prefix: str) -> None:
        container = self._service.get_container_client(self._container)
        try:
            async for blob in container.list_blobs(name_starts_with=prefix):
                await container.delete_blob(blob.name)
        except ResourceNotFoundError:
            # The container was never created (no media ever uploaded).
            return

    async def signed_url(self, blob_path: str) -> str:
        sas = await self._sas(blob_path)
        base = self._settings.media_public_base_url.rstrip("/") or self._browser_base()
        return f"{base}/{self._container}/{blob_path}?{sas}"

    async def aclose(self) -> None:
        await self._service.close()

    @abstractmethod
    async def _sas(self, blob_path: str) -> str: ...

    @abstractmethod
    def _browser_base(self) -> str:
        """Blob endpoint base (``scheme://host[/account]``) for browser URLs."""


class _ConnStringStorage(_AzureBlobStorage):
    """Local/Azurite backend: signs SAS URLs with the account key."""

    def __init__(self, settings: Settings) -> None:
        conn = settings.azure_storage_connection_string
        service = BlobServiceClient.from_connection_string(conn)
        super().__init__(service, settings.azure_storage_container, settings)
        parts = _parse_connection_string(conn)
        self._account_name = parts.get("AccountName", "")
        self._account_key = parts.get("AccountKey", "")
        protocol = parts.get("DefaultEndpointsProtocol", "https")
        self._blob_endpoint = parts.get(
            "BlobEndpoint",
            f"{protocol}://{self._account_name}.blob.core.windows.net",
        ).rstrip("/")

    def _browser_base(self) -> str:
        return self._blob_endpoint

    async def _sas(self, blob_path: str) -> str:
        now = _now()
        return generate_blob_sas(
            account_name=self._account_name,
            container_name=self._container,
            blob_name=blob_path,
            account_key=self._account_key,
            permission=BlobSasPermissions(read=True),
            start=now - _SKEW,
            expiry=now + dt.timedelta(seconds=self._settings.media_sas_ttl_seconds),
        )


class _ManagedIdentityStorage(_AzureBlobStorage):
    """Azure backend: managed identity + user-delegation SAS (no account key)."""

    def __init__(self, settings: Settings) -> None:
        # Imported lazily so local/Azurite runs never touch the identity stack.
        from azure.identity.aio import DefaultAzureCredential

        account_url = settings.azure_storage_account_url.rstrip("/")
        self._credential = DefaultAzureCredential()
        service = BlobServiceClient(account_url, credential=self._credential)
        super().__init__(service, settings.azure_storage_container, settings)
        self._account_url = account_url
        self._account_name = urlsplit(account_url).netloc.split(".")[0]
        self._delegation_key: UserDelegationKey | None = None
        self._delegation_expiry: dt.datetime | None = None

    def _browser_base(self) -> str:
        return self._account_url

    async def _user_delegation_key(self) -> UserDelegationKey:
        now = _now()
        # Keep the delegation key valid comfortably longer than any single SAS,
        # and refresh a little before it lapses.
        if (
            self._delegation_key is None
            or self._delegation_expiry is None
            or now >= self._delegation_expiry - dt.timedelta(minutes=10)
        ):
            expiry = (
                now
                + dt.timedelta(seconds=self._settings.media_sas_ttl_seconds)
                + dt.timedelta(hours=1)
            )
            self._delegation_key = await self._service.get_user_delegation_key(
                key_start_time=now - _SKEW, key_expiry_time=expiry
            )
            self._delegation_expiry = expiry
        return self._delegation_key

    async def _sas(self, blob_path: str) -> str:
        key = await self._user_delegation_key()
        now = _now()
        return generate_blob_sas(
            account_name=self._account_name,
            container_name=self._container,
            blob_name=blob_path,
            user_delegation_key=key,
            permission=BlobSasPermissions(read=True),
            start=now - _SKEW,
            expiry=now + dt.timedelta(seconds=self._settings.media_sas_ttl_seconds),
        )

    async def aclose(self) -> None:
        await super().aclose()
        await self._credential.close()


class _UnconfiguredStorage(MediaStorage):
    """No storage configured: reads/writes fail loudly, cleanup is a no-op."""

    async def upload(self, upload: MediaUpload) -> None:
        raise MediaStorageError(_UNCONFIGURED_MSG)

    async def signed_url(self, blob_path: str) -> str:
        raise MediaStorageError(_UNCONFIGURED_MSG)

    async def delete_prefix(self, prefix: str) -> None:
        # Nothing was ever stored, so there is nothing to delete.
        return None


def media_storage_configured(settings: Settings | None = None) -> bool:
    """Whether a media storage backend has been configured."""
    settings = settings or get_settings()
    return bool(
        settings.azure_storage_connection_string or settings.azure_storage_account_url
    )


@lru_cache
def get_media_storage() -> MediaStorage:
    """The process-wide media storage backend, created once and cached.

    The connection string (Azurite/local) takes precedence over the account URL
    (Azure managed identity); with neither set, an unconfigured stub is returned
    so an image-free deployment runs untouched and only actual media use fails.
    """
    settings = get_settings()
    if settings.azure_storage_connection_string:
        return _ConnStringStorage(settings)
    if settings.azure_storage_account_url:
        return _ManagedIdentityStorage(settings)
    return _UnconfiguredStorage()


async def close_media_storage() -> None:
    """Close the cached storage backend, if one was created (for shutdown)."""
    if get_media_storage.cache_info().currsize:
        await get_media_storage().aclose()
        get_media_storage.cache_clear()
