export class AppointmentAgent {
  async run({ hospitals, consultationId }: any) {
    const appointment = {
      id: `apt-${Date.now()}`,
      consultationId,
      hospitalId: hospitals[0]?.id || null,
      scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 24),
      status: 'suggested' as const,
    };
    return appointment;
  }
}
