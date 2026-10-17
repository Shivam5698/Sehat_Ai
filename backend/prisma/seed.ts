import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleHospitals = [
  {
    id: 'sample-hospital-1',
    name: 'Sample Central Care Hospital',
    location: 'Central District (sample)',
    latitude: 28.6139,
    longitude: 77.209,
    specialties: 'general medicine, emergency',
    emergency: true,
  },
  {
    id: 'sample-hospital-2',
    name: 'Sample Northside Medical Center',
    location: 'North District (sample)',
    latitude: 28.7041,
    longitude: 77.1025,
    specialties: 'internal medicine, cardiology',
    emergency: true,
  },
  {
    id: 'sample-hospital-3',
    name: 'Sample Eastside Community Clinic',
    location: 'East District (sample)',
    latitude: 28.628,
    longitude: 77.295,
    specialties: 'family medicine, pediatrics',
    emergency: false,
  },
  {
    id: 'sample-hospital-4',
    name: 'Sample Riverside Health Center',
    location: 'West District (sample)',
    latitude: 28.6517,
    longitude: 77.0667,
    specialties: 'general medicine, orthopedics',
    emergency: false,
  },
  {
    id: 'sample-hospital-5',
    name: 'Sample South Emergency Hospital',
    location: 'South District (sample)',
    latitude: 28.5355,
    longitude: 77.241,
    specialties: 'emergency, trauma care',
    emergency: true,
  },
];

async function seedHospitals() {
  for (const hospital of sampleHospitals) {
    await prisma.hospital.upsert({
      where: { id: hospital.id },
      create: {
        ...hospital,
        hospitalName: hospital.name,
      },
      update: {
        ...hospital,
        hospitalName: hospital.name,
      },
    });
  }
}

seedHospitals()
  .catch((error: unknown) => {
    console.error('Hospital seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
