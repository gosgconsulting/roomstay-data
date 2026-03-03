import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FxResponse = {
  audPerUsd: number;
  usdPerAud: number;
  fetchedAt: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = "https://api.exchangerate.host/latest?base=USD&symbols=AUD";
    console.log("[get-fx-rate] Fetching FX rate", { url });

    const res = await fetch(url);
    if (!res.ok) {
      console.error("[get-fx-rate] FX fetch failed", { status: res.status });
      return new Response("Failed to fetch FX rate", {
        status: 502,
        headers: corsHeaders,
      });
    }

    const json = await res.json();
    const audPerUsd = Number(json?.rates?.AUD);

    if (!isFinite(audPerUsd) || audPerUsd <= 0) {
      console.error("[get-fx-rate] Invalid FX payload", { json });
      return new Response("Invalid FX response", {
        status: 502,
        headers: corsHeaders,
      });
    }

    const payload: FxResponse = {
      audPerUsd,
      usdPerAud: 1 / audPerUsd,
      fetchedAt: new Date().toISOString(),
    };

    console.log("[get-fx-rate] FX rate fetched", payload);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[get-fx-rate] Unhandled error", { error });
    return new Response("Internal error", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
