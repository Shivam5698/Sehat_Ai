import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient


AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

import main  # noqa: E402


FIXTURE = AI_ROOT / "tests" / "fixtures" / "process_request.json"
client = TestClient(main.app)


def test_process_route_is_registered():
    assert any(
        route.path == "/process" and "POST" in route.methods
        for route in main.app.routes
    )


def test_backend_request_fixture_parses_and_returns_explicit_unavailable():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    parsed = main.ProcessRequest.model_validate(payload)

    assert parsed.sessionId == payload["sessionId"]
    assert parsed.metadata.conversationHistory[0].speaker == "patient"

    response = client.post("/process", json=payload)

    assert response.status_code == 503
    assert response.json() == {
        "ok": False,
        "code": "CONSULTATION_WORKFLOW_UNAVAILABLE",
        "message": (
            "The consultation workflow is unavailable because no validated "
            "orchestration pipeline is configured."
        ),
        "missingCapabilities": [
            "compatible_model_client",
            "patient_symptom_provenance",
            "approved_source_retrieval",
            "claim_level_safety_validation",
            "authoritative_risk_assessment",
            "trusted_emergency_metadata",
            "bounded_stage_timeouts",
        ],
    }
    assert "response" not in response.json()
    assert main.rag_pipeline is None


def test_invalid_request_does_not_echo_patient_text():
    response = client.post(
        "/process",
        json={
            "sessionId": "",
            "conversationId": "test-consultation",
            "language": "en",
            "input": "PRIVATE TEST TRANSCRIPT",
            "metadata": {"conversationHistory": []},
            "unexpected": "not allowed",
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "ok": False,
        "code": "INVALID_REQUEST",
        "message": "Request body is invalid.",
    }
    assert "PRIVATE TEST TRANSCRIPT" not in response.text


def test_process_does_not_call_unintegrated_rag_or_agent_services(monkeypatch):
    def unexpected_call():
        raise AssertionError("The unavailable adapter must not invoke disconnected services")

    monkeypatch.setattr(main, "get_rag_pipeline", unexpected_call)
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))

    response = client.post("/process", json=payload)

    assert response.status_code == 503


def test_real_orchestrator_fails_closed_with_specific_missing_stages():
    import asyncio

    from consultation_orchestrator import (
        WorkflowUnavailable,
        consultation_orchestrator,
    )

    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    request = main.ProcessRequest.model_validate(payload)

    try:
        asyncio.run(consultation_orchestrator.process(request))
    except WorkflowUnavailable as error:
        assert error.missing_capabilities == (
            "compatible_model_client",
            "patient_symptom_provenance",
            "approved_source_retrieval",
            "claim_level_safety_validation",
            "authoritative_risk_assessment",
            "trusted_emergency_metadata",
            "bounded_stage_timeouts",
        )
    else:
        raise AssertionError("Unverified consultation stages must fail closed")


def test_unexpected_orchestrator_error_is_not_returned_to_client(monkeypatch):
    import consultation_orchestrator

    async def fail_with_sensitive_detail(_request):
        raise RuntimeError("PRIVATE TRANSCRIPT OR STACK DETAIL")

    monkeypatch.setattr(
        consultation_orchestrator.consultation_orchestrator,
        "process",
        fail_with_sensitive_detail,
    )
    safe_client = TestClient(main.app, raise_server_exceptions=False)
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))

    response = safe_client.post("/process", json=payload)

    assert response.status_code == 500
    assert "PRIVATE TRANSCRIPT OR STACK DETAIL" not in response.text
