process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_ACCESS_SECRET = "test-access-secret-change-in-production-32";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-change-in-production-32";
process.env.JWT_ACCESS_EXPIRES = "15m";
process.env.JWT_REFRESH_EXPIRES_DAYS = "30";
process.env.APP_PUBLIC_URL = "http://localhost:4000";
