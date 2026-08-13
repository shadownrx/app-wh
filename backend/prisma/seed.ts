import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_SETTINGS } from "../src/config/constants";

const prisma = new PrismaClient();

async function main() {
  await prisma.appSetting.upsert({
    where: { key: "app" },
    update: { value: JSON.stringify(DEFAULT_SETTINGS) },
    create: { key: "app", value: JSON.stringify(DEFAULT_SETTINGS) },
  });

  const shop = [
    { key: "UNDO_PASS", name: "Deshacer pass", description: "Recuperá el último perfil que pasaste.", price: 8, sortOrder: 1 },
    { key: "EXTRA_PROFILES", name: "Perfiles extra", description: "Desbloqueá más perfiles después del límite diario.", price: 12, sortOrder: 2 },
    { key: "SUPER_INVITE", name: "Super invitación", description: "Destacá un interés enviado.", price: 20, sortOrder: 3 },
    { key: "BOOST", name: "Boost", description: "Mayor exposición temporal.", price: 40, sortOrder: 4 },
    { key: "REACTIVATE_MATCH", name: "Reactivar match", description: "Recuperá un match inactivo.", price: 15, sortOrder: 5 },
    { key: "SEE_LIKES", name: "Ver likes", description: "Mirá quién mostró interés.", price: 25, sortOrder: 6 },
    { key: "PREMIUM_FILTERS", name: "Filtros premium", description: "Acceso temporal a filtros extra.", price: 18, sortOrder: 7 },
    { key: "PREMIUM_24H", name: "Premium 24h", description: "Beneficios premium por un día.", price: 50, sortOrder: 8 },
  ];
  for (const item of shop) {
    await prisma.shopItem.upsert({
      where: { key: item.key },
      update: item,
      create: item,
    });
  }

  const passwordHash = await bcrypt.hash("Password123!", 10);
  const adminHash = await bcrypt.hash("Admin1234!", 10);

  await upsertUser({
    email: "admin@hacequepase.local",
    passwordHash: adminHash,
    role: "ADMIN",
    name: "Admin",
    gender: "OTHER",
    interestedIn: ["WOMAN", "MAN", "NON_BINARY", "OTHER"],
    dob: "1990-01-01",
    city: "La Plata",
    lat: -34.921,
    lng: -57.954,
  });

  const demo = [
    {
      email: "luna@test.local",
      name: "Luna",
      gender: "WOMAN",
      interestedIn: ["MAN"],
      lookingFor: "DATING",
      dob: "1998-04-12",
      bio: "Café, cine y planes que realmente pasen.",
      interests: ["café", "cine", "música"],
      lat: -34.921,
      lng: -57.954,
    },
    {
      email: "martin@test.local",
      name: "Martín",
      gender: "MAN",
      interestedIn: ["WOMAN"],
      lookingFor: "RELATIONSHIP",
      dob: "1996-09-03",
      bio: "Me gusta que las cosas avancen.",
      interests: ["fútbol", "café", "cocinar"],
      lat: -34.918,
      lng: -57.95,
    },
    {
      email: "sofia@test.local",
      name: "Sofía",
      gender: "WOMAN",
      interestedIn: ["MAN", "WOMAN"],
      lookingFor: "DATING",
      dob: "1999-11-20",
      bio: "Planes tranquilos, sin swipe infinito.",
      interests: ["libros", "cine", "arte"],
      lat: -34.925,
      lng: -57.96,
    },
    {
      email: "diego@test.local",
      name: "Diego",
      gender: "MAN",
      interestedIn: ["WOMAN"],
      lookingFor: "CASUAL",
      dob: "1995-02-14",
      bio: "Bar, música en vivo y buena charla.",
      interests: ["música", "bar", "viajes"],
      lat: -34.91,
      lng: -57.94,
    },
    {
      email: "valen@test.local",
      name: "Valen",
      gender: "NON_BINARY",
      interestedIn: ["WOMAN", "MAN", "NON_BINARY"],
      lookingFor: "FRIENDSHIP",
      dob: "2000-06-08",
      bio: "Primero charlar, después ver.",
      interests: ["arte", "café", "fotografía"],
      lat: -34.93,
      lng: -57.955,
    },
  ];

  for (const u of demo) {
    await upsertUser({
      ...u,
      passwordHash,
      role: "USER",
      city: "La Plata",
    });
  }

  console.log("Seed OK");
  console.log("Admin: admin@hacequepase.local / Admin1234!");
  console.log("Users: luna|martin|sofia|diego|valen @test.local / Password123!");
}

async function upsertUser(input: {
  email: string;
  passwordHash: string;
  role: string;
  name: string;
  gender: string;
  interestedIn: string[];
  lookingFor?: string;
  dob: string;
  city: string;
  lat: number;
  lng: number;
  bio?: string;
  interests?: string[];
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  const data = {
    passwordHash: input.passwordHash,
    dateOfBirth: new Date(input.dob),
    termsAcceptedAt: new Date(),
    privacyAcceptedAt: new Date(),
    emailVerifiedAt: new Date(),
    status: "ACTIVE",
    role: input.role,
  };
  const user = existing
    ? await prisma.user.update({ where: { email: input.email }, data })
    : await prisma.user.create({ data: { email: input.email, ...data } });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      displayName: input.name,
      gender: input.gender,
      interestedIn: JSON.stringify(input.interestedIn),
      lookingFor: input.lookingFor ?? "DATING",
      city: input.city,
      latitude: input.lat,
      longitude: input.lng,
      bio: input.bio ?? "",
      interests: JSON.stringify(input.interests ?? []),
      onboardingCompletedAt: new Date(),
      verifiedAt: new Date(),
      verificationMethod: "EMAIL",
    },
    create: {
      userId: user.id,
      displayName: input.name,
      gender: input.gender,
      interestedIn: JSON.stringify(input.interestedIn),
      lookingFor: input.lookingFor ?? "DATING",
      city: input.city,
      latitude: input.lat,
      longitude: input.lng,
      bio: input.bio ?? "",
      interests: JSON.stringify(input.interests ?? []),
      onboardingCompletedAt: new Date(),
      verifiedAt: new Date(),
      verificationMethod: "EMAIL",
    },
  });
  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, earnedBalance: 40 },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  await prisma.reputation.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  const photos = await prisma.photo.count({ where: { userId: user.id } });
  if (photos === 0) {
    await prisma.photo.create({
      data: { userId: user.id, url: `/uploads/placeholder-${input.name.toLowerCase()}.jpg`, position: 0 },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
