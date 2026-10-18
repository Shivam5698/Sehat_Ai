# AI Service

The FastAPI application is `main:app` and listens on port 8000 when started
from this directory:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

`GET /health` reports application availability. `POST /process` validates the
backend request, invokes the fail-closed consultation orchestrator, and returns
HTTP 503 `CONSULTATION_WORKFLOW_UNAVAILABLE` with the missing capability keys.
The Python agent routes and RAG pipeline are not integrated implementations of
the required transcript response boundary. Do not interpret this response or
its synthetic contract tests as a generated clinical assessment.

RAG-backed routes initialize the vector-store integration on first use and
require the configured retrieval dependencies and data. The consultation
adapter does not invoke those routes, any LLM, or a database.
