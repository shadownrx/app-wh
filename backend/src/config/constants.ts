export const GENDERS = ["WOMAN", "MAN", "NON_BINARY", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

export const LOOKING_FOR = [
  "RELATIONSHIP",
  "DATING",
  "FRIENDSHIP",
  "CASUAL",
  "NOT_SURE",
] as const;

export const PLAN_TYPES = [
  "COFFEE",
  "FOOD",
  "BAR",
  "CINEMA",
  "ACTIVITY",
  "QUIET",
  "OTHER",
] as const;

export const CONNECTION_STATUS = {
  MATCH: "MATCH",
  TALKING: "TALKING",
  PROPOSAL: "PROPOSAL",
  DATE_AGREED: "DATE_AGREED",
  DATE_VERIFIED: "DATE_VERIFIED",
  SECOND_DATE: "SECOND_DATE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export const SWIPE = {
  LIKE: "LIKE",
  PASS: "PASS",
  SUPER_INVITE: "SUPER_INVITE",
} as const;

export const SHOP_KEYS = {
  UNDO_PASS: "UNDO_PASS",
  EXTRA_PROFILES: "EXTRA_PROFILES",
  SUPER_INVITE: "SUPER_INVITE",
  BOOST: "BOOST",
  REACTIVATE_MATCH: "REACTIVATE_MATCH",
  SEE_LIKES: "SEE_LIKES",
  PREMIUM_FILTERS: "PREMIUM_FILTERS",
  PREMIUM_24H: "PREMIUM_24H",
} as const;

export const REWARD_REASONS = {
  MATCH: "MATCH",
  MEANINGFUL_CONVERSATION: "MEANINGFUL_CONVERSATION",
  DATE_ACCEPTED: "DATE_ACCEPTED",
  DATE_VERIFIED: "DATE_VERIFIED",
  SECOND_DATE_VERIFIED: "SECOND_DATE_VERIFIED",
  JOINT_PHOTO: "JOINT_PHOTO",
} as const;

export const DEFAULT_SETTINGS = {
  dailyProfileLimit: 30,
  extraProfilesPerPurchase: 10,
  matchInactiveHours: 48,
  qrValiditySeconds: 90,
  meaningfulConversationMinMessagesEach: 5,
  dailyEarnedCap: 120,
  boostHours: 24,
  seeLikesHours: 24,
  premiumHours: 24,
  checkInLocationEnabled: false,
  checkInMaxDistanceMeters: 500,
  proposalLabel: "Proponer cita",
  currencyName: "Coins",
  rewards: {
    MATCH: 1,
    MEANINGFUL_CONVERSATION: 3,
    DATE_ACCEPTED: 8,
    DATE_VERIFIED: 30,
    SECOND_DATE_VERIFIED: 40,
    JOINT_PHOTO: 5,
  },
  shopPrices: {
    UNDO_PASS: 8,
    EXTRA_PROFILES: 12,
    SUPER_INVITE: 20,
    BOOST: 40,
    REACTIVATE_MATCH: 15,
    SEE_LIKES: 25,
    PREMIUM_FILTERS: 18,
    PREMIUM_24H: 50,
  },
};

export type AppSettings = typeof DEFAULT_SETTINGS;

export const FUNNEL_EVENTS = [
  "REGISTERED",
  "PROFILE_COMPLETED",
  "FIRST_INTEREST",
  "FIRST_MATCH",
  "FIRST_MESSAGE",
  "FIRST_PROPOSAL",
  "FIRST_DATE_ACCEPTED",
  "FIRST_DATE_VERIFIED",
] as const;
