import "dotenv/config";
// Les tests utilisent une base dédiée si TEST_DATABASE_URL est défini (recommandé : elle est vidée).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
