import { prisma } from "./prisma";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function notify(input: NotifyInput) {
  await prisma.analyticsEvent.create({
    data: {
      userId: input.userId,
      name: `PUSH_${input.type}`,
      properties: JSON.stringify({
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      }),
    },
  });
}
