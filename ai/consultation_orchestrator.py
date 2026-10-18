from __future__ import annotations

from typing import NoReturn, TYPE_CHECKING

if TYPE_CHECKING:
    from main import ProcessRequest


class WorkflowUnavailable(Exception):
    def __init__(self, missing_capabilities: tuple[str, ...]):
        self.missing_capabilities = missing_capabilities
        super().__init__("Consultation workflow capabilities are unavailable.")


class ConsultationOrchestrator:
    """Fail closed until required consultation stages have verified implementations."""

    REQUIRED_CAPABILITIES = (
        "compatible_model_client",
        "patient_symptom_provenance",
        "approved_source_retrieval",
        "claim_level_safety_validation",
        "authoritative_risk_assessment",
        "trusted_emergency_metadata",
        "bounded_stage_timeouts",
    )

    async def process(self, _request: ProcessRequest) -> NoReturn:
        raise WorkflowUnavailable(self.REQUIRED_CAPABILITIES)


consultation_orchestrator = ConsultationOrchestrator()
