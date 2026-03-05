import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
  if (req) {
    const requested = req.headers.get("Access-Control-Request-Headers");
    if (requested) headers["Access-Control-Allow-Headers"] = requested;
  }
  return headers;
}

type FxResponse = {
  audPerUsd: number;
  usdPerAud: number;
  fetchedAt: string;
};

/** Today's date in UTC (YYYY-MM-DD) for rate_date. */
function todayUtc(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[get-fx-rate] Missing Supabase env");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const rateDate = todayUtc();

  try {
    // Return cached rate for today if we have it
    const { data: row, error: selectError } = await supabase
      .from("fx_rates")
      .select("aud_per_usd, created_at")
      .eq("rate_date", rateDate)
      .maybeSingle();

    if (!selectError && row && Number(row.aud_per_usd) > 0) {
      const audPerUsd = Number(row.aud_per_usd);
      const payload: FxResponse = {
        audPerUsd,
        usdPerAud: 1 / audPerUsd,
        fetchedAt: (row.created_at as string) ?? new Date().toISOString(),
      };
      console.log("[get-fx-rate] Returning cached rate for", rateDate, payload);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // No cache for today: fetch from API and store
    const accessKey = Deno.env.get("EXCHANGERATE_HOST_ACCESS_KEY");
    const url = accessKey
      ? `https://api.exchangerate.host/latest?symbols=USD,AUD&access_key=${accessKey}`
      : "https://api.frankfurter.app/latest?from=USD&to=AUD";
    console.log("[get-fx-rate] Fetching FX rate from API", { rateDate });

    const res = await fetch(url);
    if (!res.ok) {
      console.error("[get-fx-rate] FX fetch failed", { status: res.status });
      return new Response("Failed to fetch FX rate", {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    // exchangerate.host: { rates: { AUD: 1.53 } }; Frankfurter: { rates: { AUD: 1.53 } }
    const audPerUsd = Number(json?.rates?.AUD);

    if (!isFinite(audPerUsd) || audPerUsd <= 0) {
      console.error("[get-fx-rate] Invalid FX payload", { json });
      return new Response("Invalid FX response", {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const createdAt = new Date().toISOString();

    const { error: upsertError } = await supabase.from("fx_rates").upsert(
      { rate_date: rateDate, aud_per_usd: audPerUsd, created_at: createdAt },
      { onConflict: "rate_date" }
    );

    if (upsertError) {
      console.error("[get-fx-rate] Failed to store rate", { error: upsertError });
      // Still return the rate; next request will try cache again
    }

    const payload: FxResponse = {
      audPerUsd,
      usdPerAud: 1 / audPerUsd,
      fetchedAt: createdAt,
    };

    console.log("[get-fx-rate] FX rate fetched and stored", payload);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[get-fx-rate] Unhandled error", { error });
    return new Response("Internal error", {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
