// Simple TOTP (RFC 6238) utilities using Web Crypto
// Supports Google Authenticator-style Base32 secrets and otpauth:// URIs.

function base32ToBytes(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "=") break;
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

async function hmac(keyBytes, msgBytes, algorithm = "SHA-1") {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: { name: algorithm } },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
  return new Uint8Array(sig);
}

function intToBytesBE(num) {
  // 8-byte big-endian counter
  const arr = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    arr[i] = num & 0xff;
    num = Math.floor(num / 256);
  }
  return arr;
}

export async function generateTOTP(secretBase32, { period = 30, digits = 6, algorithm = "SHA-1", timestamp = Date.now() } = {}) {
  const key = base32ToBytes(secretBase32);
  const counter = Math.floor(Math.floor(timestamp / 1000) / period);
  const msg = intToBytesBE(counter);
  const mac = await hmac(key, msg, algorithm);
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  const code = String(bin % mod).padStart(digits, "0");
  return code;
}

export async function verifyTOTP(secretBase32, token, { period = 30, digits = 6, algorithm = "SHA-1", window = 1, timestamp = Date.now() } = {}) {
  const t = Math.floor(Math.floor(timestamp / 1000) / period);
  const promises = [];
  for (let w = -window; w <= window; w++) {
    const ts = (t + w) * period * 1000;
    promises.push(generateTOTP(secretBase32, { period, digits, algorithm, timestamp: ts }));
  }
  const codes = await Promise.all(promises);
  return codes.includes(String(token).trim());
}

export function parseTotpConfig(input) {
  // Accepts Base32 secret or otpauth:// URI
  const raw = String(input || "").trim();
  let secret = raw;
  let digits = 6;
  let period = 30;
  let algorithm = "SHA-1";
  if (/^otpauth:\/\//i.test(raw)) {
    try {
      // Some otpauth may not be absolute URL compatible in Node, but in browser URL works
      const url = new URL(raw);
      const params = url.searchParams;
      const s = params.get("secret") || "";
      const d = parseInt(params.get("digits") || "6", 10);
      const p = parseInt(params.get("period") || "30", 10);
      const a = (params.get("algorithm") || "SHA1").toUpperCase();
      secret = s;
      digits = Number.isFinite(d) && d > 0 ? d : 6;
      period = Number.isFinite(p) && p > 0 ? p : 30;
      if (a === "SHA1") algorithm = "SHA-1";
      else if (a === "SHA256") algorithm = "SHA-256";
      else if (a === "SHA512") algorithm = "SHA-512";
    } catch (_) {
      // fall back to raw
    }
  }
  return { secret, digits, period, algorithm };
}
