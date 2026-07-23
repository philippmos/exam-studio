# Importing exams

An exam is imported as data — the app generates fresh UUIDs for every row, so the
same document can be imported repeatedly as independent exams. There are two
channels:

| Channel | Transport | Use it for |
| ------- | --------- | ---------- |
| **JSON** | GraphQL mutation `importExam` / `addExamQuestions` (a JSON string) | Text‑only exams (question text may still contain HTML, just no bundled images). |
| **ZIP** | REST upload `POST /import/zip` / `POST /import/exams/{examId}/zip` (`multipart/form-data`) | Exams whose questions embed **images**. The archive bundles the JSON manifest with the image files. |

The Angular import dialogs pick the channel automatically from the chosen file's
extension (`.json` → JSON, `.zip` → ZIP), so end users just pick a file.

Behind nginx the browser reaches a single origin: `/graphql` and `/import` are
both reverse‑proxied to the API.

---

## The exam document (`exam.json`)

Both channels use the same document shape. It carries no ids: sections are
referenced by their `key`, question order follows the file, and the database
generates UUIDs on import. The full shape (all question types, every field) is
documented in the repo‑root [`exam.schema.json`](../exam.schema.json) and the
[api README](../api/README.md#import-data).

Question `question_type` is one of `single_choice`, `multiple_choice`,
`allocation`, `select_and_place`, `yes_no` or `selectbox`. Every question may
carry an optional `explanation`.

`allocation` and `select_and_place` questions may include **distractors** — an
allocation `item` that omits `correct_category`, or a select-and-place option
that omits `correct_position`, belongs in no basket/slot. The learner can still
drag a distractor into a basket or slot, but doing so (or leaving a real
item/option out) makes the answer incorrect; only the items/options that carry
the attribute count towards the solution. Each such question needs at least one
item/option that *does* carry the attribute.

**HTML is allowed** in a question's `question` and `explanation` text — it is
rendered as sanitised HTML in the client (`<script>`, event handlers, etc. are
stripped). This is what makes embedded images possible.

---

## Images in questions

### 1. Reference images from the HTML

In a question's `question` or `explanation` text, reference a bundled image with
a **ZIP‑relative path under `images/`**:

```json
{
  "question": "Which component is highlighted? <img src=\"images/topology.png\" alt=\"network diagram\">",
  "explanation": "The gateway — see <img src=\"images/topology-solution.png\">.",
  "section_key": "networking",
  "question_type": "single_choice",
  "answers": [{ "text": "The gateway", "is_correct": true }, { "text": "A switch" }]
}
```

* Paths are **case‑sensitive** and must start with `images/`.
* `./images/x.png` and `images/x.png` are equivalent; `\` is normalised to `/`.
* Any other `src` (an absolute `http(s)://` URL, a `data:` URI, an absolute or
  traversing path) is **left untouched** — only `images/…` references are
  resolved to bundled files.

### 2. Bundle the archive

```
exam.zip
├── exam.json          # the manifest, at the archive ROOT, named exactly exam.json
└── images/            # the image files referenced from question HTML
    ├── topology.png
    └── topology-solution.png
```

### 3. What the import does

1. **Validates** the archive (see *Limits & security* below) and the manifest
   (identical rules to a JSON import).
2. For every referenced image: sniffs its type, uploads it to Azure Blob Storage
   at a content‑addressed path `exams/{examId}/{sha256}.{ext}`, and records a
   `question_media` row.
3. Rewrites each `<img src="images/…">` to a stable placeholder
   `<img src="media://{mediaId}">` in the stored question text.

Nothing is uploaded until the whole document has validated, so a rejected import
never leaves stray blobs.

### 4. How images are served

When a question is served (inside an exam session), each `media://{id}`
placeholder is swapped for a **short‑lived, read‑only signed URL** (an Azure SAS
URL, valid `MEDIA_SAS_TTL_SECONDS`, default 1 h). The browser then loads the
image **directly from Blob Storage** — the API never streams the bytes. The
persisted text keeps the environment‑independent `media://` placeholder, so the
same database is portable across dev/staging/prod.

---

## Limits & security

The ZIP import is hardened against hostile archives. Defaults (all configurable,
see below):

| Guard | Default | Setting |
| ----- | ------- | ------- |
| Max archive size | 25 MB | `IMPORT_ZIP_MAX_BYTES` |
| Max size per image | 5 MB | `MEDIA_MAX_FILE_BYTES` |
| Max images per import | 50 | `MEDIA_MAX_FILES` |
| Allowed image types | `image/png,image/jpeg,image/gif,image/webp,image/svg+xml` | `MEDIA_ALLOWED_CONTENT_TYPES` |

Additional protections:

* **Zip‑slip** — entries with absolute or `..` paths are rejected.
* **Zip‑bomb** — total uncompressed size and entry count are capped.
* **Content sniffing** — an image's type is detected from its **magic bytes**,
  never trusted from the file extension; a mismatch or disallowed type is
  rejected.
* **SVG** — allowed, and safe here because images are rendered via `<img src>`
  (browsers never execute scripts in an SVG loaded that way) and served from a
  separate storage origin, isolated from the app.
* **Private storage** — the blob container is private; images are only reachable
  through the short‑lived signed URLs the API mints for the owner's session.

Every rejection returns a clear message (HTTP 400, or 413 for an oversized
upload).

---

## Adding questions to an existing exam (merge)

`POST /import/exams/{examId}/zip` (and the JSON `addExamQuestions`) **add only
new questions** — existing ones are skipped and nothing is removed. A question is
"new" when its text is not already present.

For image questions the comparison is **content‑aware**: a question already
imported with a given image is recognised as a duplicate on re‑import even though
its stored `media://` reference differs from the incoming `images/…` one (both
resolve to the same image content hash). Two questions with identical text but
*different* images stay distinct.

Response: `{ "examId": "...", "added": N, "skipped": M }`.

---

## Endpoint reference

| Method & path | Body | Result |
| ------------- | ---- | ------ |
| `POST /import/zip` | `multipart/form-data`, field `file` = the `.zip` | `201 { "examId": "<uuid>" }` |
| `POST /import/exams/{examId}/zip` | same | `200 { "examId", "added", "skipped" }` |
| GraphQL `importExam(payload: String!)` | JSON string | the created `Exam` |
| GraphQL `addExamQuestions(examId, payload: String!)` | JSON string | `{ exam, added, skipped }` |

All require the same Auth0 Bearer access token as the rest of the API.

---

## Storage configuration

Question images live in an Azure Blob Storage container. The API chooses its
backend from configuration:

| Setting | Purpose |
| ------- | ------- |
| `AZURE_STORAGE_CONNECTION_STRING` | Local/dev (Azurite). When set, it takes precedence. |
| `AZURE_STORAGE_ACCOUNT_URL` | Azure, e.g. `https://<acct>.blob.core.windows.net`. The container app authenticates with its **managed identity** (no keys/secrets). |
| `AZURE_STORAGE_CONTAINER` | Container name (default `question-media`). |
| `MEDIA_PUBLIC_BASE_URL` | Optional. Rewrites the host of signed URLs for the browser (used locally so the browser reaches Azurite on the published port; leave empty in Azure). |
| `MEDIA_SAS_TTL_SECONDS` | Signed‑URL lifetime (default 3600). |

### Local development (Azurite)

`docker compose up` starts the bundled **Azurite** emulator; the repo‑root
`.env.example` already points `AZURE_STORAGE_CONNECTION_STRING` at it and sets
`MEDIA_PUBLIC_BASE_URL=http://localhost:10000/devstoreaccount1` so signed URLs
work from the browser. For `uvicorn`/host runs, `api/.env.example` points the
connection string at `localhost:10000` instead.

### Azure (Container Apps)

1. Create a Storage account + a **private** blob container.
2. Give the container app's **managed identity** the **Storage Blob Data
   Contributor** role on the account (this also permits generating the
   user‑delegation key used to sign URLs — no account key needed).
3. Set `AZURE_STORAGE_ACCOUNT_URL` (and optionally `AZURE_STORAGE_CONTAINER`);
   leave `AZURE_STORAGE_CONNECTION_STRING` empty.
4. Recommended hardening: disable Shared Key access on the account
   (`allowSharedKeyAccess=false`) — user‑delegation SAS still works.

Deleting an exam removes its blob prefix (`exams/{examId}/`) as well as the
`question_media` rows, so no orphaned images are left behind.
