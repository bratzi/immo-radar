import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Service-Key NUR im Scraper verwenden, niemals im spaeteren Frontend (Plan 3).
export const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
