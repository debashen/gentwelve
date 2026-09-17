const mode = process.argv[2] || "daily";
if (!["daily", "full"].includes(mode)) throw new Error("Usage: pnpm catalogue:sync daily|full");
const base = process.env.SYNC_BASE_URL?.trim();
const key = process.env.AMROD_SYNC_KEY;
if (!base || !key) throw new Error("SYNC_BASE_URL and AMROD_SYNC_KEY must be configured.");
const origin = new URL(base);
if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Sync requires HTTPS.");

async function request(query = "", method = "GET") {
  const response = await fetch(new URL(`/api/admin/sync${query}`, origin), {
    method, redirect: "error", headers: { "x-sync-key": key }, signal: AbortSignal.timeout(310000),
  });
  if (!response.ok) throw new Error(`Sync request failed (HTTP ${response.status}); progress is saved. Check the admin import status.`);
  return response.json();
}

try {
  const datasets = mode === "full" ? ["products", "variants", "enrichment", "prices", "stock"] : ["products", "prices", "stock"];
  for (const dataset of datasets) {
    const overview = await request();
    let run = overview.runs[dataset];
    // Resume a saved run before starting another. Daily/weekly runners share a
    // workflow concurrency group; don't run the admin importer simultaneously.
    if (run?.status !== "running") run = await request(`?type=${dataset}${dataset === "products" && mode === "daily" ? "&strategy=changes" : ""}`, "POST");
    const runId = run.runId || run.id;
    let complete = false;
    for (let step = 0; step < 2000; step++) {
      run = await request(`?runId=${runId}`, "POST");
      console.log(`${dataset}: ${run.status}, received=${run.received}, stored=${run.stored}`);
      if (run.status === "complete") { complete = true; break; }
    }
    if (!complete) throw new Error("Sync reached its safety limit; run again to resume.");
  }
} catch (error) {
  // Only our own fixed messages are printed; never response bodies or headers.
  console.error(error instanceof Error && error.message.startsWith("Sync ") ? error.message : "Sync failed. Check configuration and connectivity; run again to resume.");
  process.exitCode = 1;
}
