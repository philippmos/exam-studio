from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import GraphQLRouter

from app.config import settings
from app.database import get_db_session
from app.graphql.schema import schema


async def get_context(db: AsyncSession = Depends(get_db_session)) -> dict:
    """Expose the request-scoped DB session to GraphQL resolvers via context."""
    return {"db": db}


graphql_app = GraphQLRouter(schema, context_getter=get_context)

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
