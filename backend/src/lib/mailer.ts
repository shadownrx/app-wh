import { env } from "../config/env";

const inbox: { to: string; subject: string; body: string; at: Date }[] = [];

export function getDevInbox() {
  return inbox.slice(-20);
}

export async function sendMail(to: string, subject: string, body: string) {
  inbox.push({ to, subject, body, at: new Date() });
  if (!env.isTest) {
    console.log(`[mail] to=${to} subject=${subject}\n${body}`);
  }
}
