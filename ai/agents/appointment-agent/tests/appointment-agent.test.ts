import { describe, expect, it } from "vitest";
import { AppointmentAgent } from "../service";

describe("AppointmentAgent", () => {
  it("should suggest an appointment from hospital recommendations", async () => {
    const agent = new AppointmentAgent();
    const result = await agent.execute({
      patientId: "patient-123",
      hospitalRecommendations: [{ id: "hospital-1", name: "Central Care", specialty: "Cardiology" }],
      symptomProfile: { disease: "cardiology" },
      riskLevel: "HIGH",
    });

    expect(result.appointmentId).toBeDefined();
    expect(result.status).toBe("suggested");
    expect(result.hospitalId).toBe("hospital-1");
  });
});
