"""Media storage: Azure Blob backend and question-text URL resolution."""

from app.storage.blob import (
    MediaStorage,
    MediaStorageError,
    MediaUpload,
    close_media_storage,
    get_media_storage,
    media_storage_configured,
)
from app.storage.resolver import (
    MEDIA_URI_RE,
    iter_media_ids,
    replace_media_placeholders,
)

__all__ = [
    "MEDIA_URI_RE",
    "MediaStorage",
    "MediaStorageError",
    "MediaUpload",
    "close_media_storage",
    "get_media_storage",
    "iter_media_ids",
    "media_storage_configured",
    "replace_media_placeholders",
]
