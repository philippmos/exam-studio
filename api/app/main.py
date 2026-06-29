from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import GraphQLRouter

from app.auth import AuthError, get_or_create_user, verify_access_token
from app.config import settings
from app.database import get_db_session
from app.dpop import verify_dpop_proof
from app.graphql.schema import schema


def _reconstruct_htu(request: Request) -> str:
    """The absolute request URL as the browser issued it (for DPoP ``htu``).

    Behind the nginx reverse proxy the API is reached as ``api:8000`` but the
    client signs the proof against the public origin, so prefer the forwarded
    headers nginx sets (see ``client/nginx.conf``).
    """
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    )
    return f"{proto}://{host}{request.url.path}"


async def get_context(
    request: Request, db: AsyncSession = Depends(get_db_session)
) -> dict:
    """Authenticate the request and expose db + user to GraphQL resolvers.

    Requires a valid Auth0 access token (``Bearer`` or ``DPoP``). A sender-
    constrained token (one carrying a ``cnf.jkt`` claim) additionally requires a
    valid DPoP proof, so it can be neither replayed nor downgraded to a plain
    bearer token. Authentication failures become HTTP 401 before any resolver
    runs.
    """
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    scheme = scheme.lower()
    if not token or scheme not in ("bearer", "dpop"):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer, DPoP"},
        )

    try:
        claims = verify_access_token(token)
        cnf_jkt = (claims.get("cnf") or {}).get("jkt")
        if scheme == "dpop" or cnf_jkt:
            proof = request.headers.get("dpop")
            if not proof:
                raise AuthError("A DPoP proof is required for this token.")
            verify_dpop_proof(
                proof,
                access_token=token,
                htm=request.method,
                htu=_reconstruct_htu(request),
                cnf_jkt=cnf_jkt,
            )
        user = await get_or_create_user(db, claims)
    except AuthError as exc:
        raise HTTPException(
            status_code=401,
            detail=exc.detail,
            headers={"WWW-Authenticate": f'DPoP error="{exc.error}"'},
        ) from exc

    return {"db": db, "user": user, "claims": claims}


graphql_app = GraphQLRouter(
    schema,
    context_getter=get_context,
    # The in-browser IDE cannot attach an access token, so only expose it in
    # debug builds. The secured endpoint still serves POST operations.
    graphql_ide="graphiql" if settings.debug else None,
)

app = FastAPI(title="Exam Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graphql_app, prefix="/graphql")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
