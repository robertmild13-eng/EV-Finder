/**
 * Manual Trigger — POST /.netlify/functions/trigger-scan
 * 
 * Call this from your dashboard or browser to run an immediate scan.
 * Same logic as the scheduled function but triggered on demand.
 */

export async function handler(event) {
  // Import and run the daily scan handler
  const { handler: scanHandler } = await import("./daily-scan.mjs");
  return scanHandler(event);
}
