import "dotenv/config";
import { pool } from "@/db";
import { runReminders } from "@/modules/reminders/service";

runReminders()
  .then((r) => console.log(`Rappels : ${r.leases} locations vérifiées, ${r.sent} notification(s) créée(s).`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
