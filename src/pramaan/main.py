import uvicorn

from pramaan.api.app import app  # noqa: F401  (uvicorn import path src.pramaan.main:app)

if __name__ == "__main__":
    uvicorn.run("pramaan.main:app", host="127.0.0.1", port=8000, reload=True)
