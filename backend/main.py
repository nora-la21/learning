import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from database import DB_PATH, init_db, seed_builtin_lists
from routers import words, upload, game, progress, tts


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_builtin_lists()
    yield


app = FastAPI(title="Language Learning App", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"chrome-extension://.*|moz-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    if request.method == "OPTIONS" and "access-control-request-private-network" in request.headers:
        return Response(headers={
            "Access-Control-Allow-Private-Network": "true",
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        })
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

app.include_router(words.router)
app.include_router(upload.router)
app.include_router(game.router)
app.include_router(progress.router)
app.include_router(tts.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


@app.get("/api/backup")
def backup_db(key: str = ""):
    if not _ADMIN_KEY or key != _ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid key")
    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(str(DB_PATH), filename="learning.db", media_type="application/octet-stream")


@app.post("/api/restore")
async def restore_db(key: str = "", file: UploadFile = File(...)):
    if not _ADMIN_KEY or key != _ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid key")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        shutil.move(tmp.name, str(DB_PATH))
    except Exception:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail="Restore failed")
    return {"status": "restored"}


_static_dir = os.path.join(os.path.dirname(__file__), "static")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if os.path.isdir(_static_dir):
        candidate = os.path.normpath(os.path.join(_static_dir, full_path))
        if candidate.startswith(_static_dir) and os.path.isfile(candidate):
            return FileResponse(candidate)
        index = os.path.join(_static_dir, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
    raise HTTPException(status_code=404, detail="Not found")
