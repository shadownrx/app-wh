export function ageFromDob(dob: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const month = now.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function assertAdult(dob: Date) {
  if (ageFromDob(dob) < 18) {
    const err = new Error("Debés tener al menos 18 años para registrarte");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
