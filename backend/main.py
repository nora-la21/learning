from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from database import init_db, seed_builtin_lists
from routers import words, upload, game, progress, tts


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_builtin_lists()
    yield


app = FastAPI(title="Language Learning App", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"chrome-extension://.*|moz-extension://.*",
    allow_credentials=True,
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
