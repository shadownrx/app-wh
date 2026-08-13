import { Connection, Profile, User } from "@prisma/client";
import { ageFromDob } from "./age";
import { approxDistanceLabel, haversineMeters } from "./geo";

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function publicProfile(
  user: User & { profile: Profile | null; photos: { id: string; url: string; position: number }[] },
  viewer?: { latitude?: number | null; longitude?: number | null },
  extras: Record<string, unknown> = {}
) {
  const profile = user.profile;
  if (!profile) return null;
  const age = ageFromDob(user.dateOfBirth);
  let distanceMeters: number | null = null;
  if (
    viewer?.latitude != null &&
    viewer?.longitude != null &&
    profile.latitude != null &&
    profile.longitude != null
  ) {
    distanceMeters = haversineMeters(
      viewer.latitude,
      viewer.longitude,
      profile.latitude,
      profile.longitude
    );
  }
  return {
    id: user.id,
    name: profile.displayName,
    age,
    gender: profile.gender,
    lookingFor: profile.lookingFor,
    city: profile.city,
    zone: profile.zone,
    distanceLabel: approxDistanceLabel(distanceMeters),
    bio: profile.bio,
    job: profile.job,
    studies: profile.studies,
    interests: parseJsonArray(profile.interests),
    photos: [...user.photos]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, url: p.url, position: p.position })),
    badges: {
      verified: Boolean(profile.verifiedAt || user.emailVerifiedAt),
      reliable: false,
    },
    ...extras,
  };
}

export function pairIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function otherUserId(connection: Connection, userId: string): string {
  return connection.userLowId === userId ? connection.userHighId : connection.userLowId;
}

export function isParticipant(connection: Connection, userId: string): boolean {
  return connection.userLowId === userId || connection.userHighId === userId;
}
