from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import CORS_ORIGIN_REGEX, CORS_ORIGINS, UPLOADS_DIR
from .database import ensure_schema
from .routers.auth import router as auth_router
from .routers.courses import router as courses_router
from .services.upload_service import ensure_upload_directories

app = FastAPI(title="EduFlow API", version="0.1.0")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
  CORSMiddleware,
  allow_origins=CORS_ORIGINS,
  allow_origin_regex=CORS_ORIGIN_REGEX,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
  UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
  ensure_upload_directories()
  ensure_schema()


@app.get("/health")
def health_check() -> dict[str, str]:
  return {"status": "ok"}


app.include_router(auth_router)
app.include_router(courses_router)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
