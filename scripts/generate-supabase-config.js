#!/usr/bin/env node
/**
 * Vercel build: writes supabase-config.js from environment variables.
 * Set in Vercel → Project → Settings → Environment Variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'supabase-config.js');
const url =
  process.env.SUPABASE_URL ||
  process.env.APISupabase ||
  process.env.API_SUPABASE ||
  '';
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.AnonSupabase ||
  process.env.ANON_SUPABASE ||
  '';

if (url && anonKey) {
  const body = `window.SUPABASE_CONFIG = ${JSON.stringify({ url, anonKey }, null, 2)};\n`;
  fs.writeFileSync(out, body);
  console.log('Wrote supabase-config.js from environment variables');
} else if (fs.existsSync(out)) {
  console.log('Keeping existing supabase-config.js (no env vars set)');
} else {
  fs.writeFileSync(
    out,
    `// Not configured — add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, or commit supabase-config.js\nwindow.SUPABASE_CONFIG = null;\n`
  );
  console.warn('No Supabase env vars — dashboard will run in local-only mode');
}
