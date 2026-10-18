import { prisma } from '../database/client.js';

export interface HospitalRecommendation {
  id: string;
  name: string;
  emergencyAvailable: boolean;
  sample: boolean;
}

export class HospitalAgent {
  async run(): Promise<HospitalRecommendation[]> {
    const hospitals = await prisma.hospital.findMany({
      select: { id: true, name: true, emergency: true },
      orderBy: [{ emergency: 'desc' }, { name: 'asc' }],
    });

    return hospitals.map((hospital: { id: string; name: string; emergency: boolean }) => ({
      id: hospital.id,
      name: hospital.name,
      emergencyAvailable: hospital.emergency,
      sample: hospital.id.startsWith('sample-hospital-'),
    }));
  }
}
