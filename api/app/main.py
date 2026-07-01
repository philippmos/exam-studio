import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import GraphQLRouter

from app.auth import get_or_create_user
from app.core.config import get_settings
from app.core.security import AuthError, verify_access_token
from app.db.session import get_db_session
from app.graphql.schema import schema

settings = get_settings()

logger = logging.getLogger("app.auth")


async def get_context(
    request: Request, db: AsyncSession = Depends(get_db_session)
) -> dict:
    """Authenticate the request and expose db + user to GraphQL resolvers.

    Requires a valid Auth0 Bearer access token for the configured audience.
    Authentication failures become HTTP 401 before any resolver runs.
    """
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if not token or scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = verify_access_token(token)
        user = await get_or_create_user(db, claims)
    except AuthError as exc:
        # Log the reason (not the token) so token-rejection causes are diagnosable.
        logger.warning("Access token rejected: %s", exc.detail)
        raise HTTPException(
            status_code=401,
            detail=exc.detail,
            headers={"WWW-Authenticate": f'Bearer error="{exc.error}"'},
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
