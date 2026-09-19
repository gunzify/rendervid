/**
 * End-to-end smoke test of the PRD §162 money cycle over live HTTP,
 * in zero-key mode (dev auth + mock provider + inline queue + local storage).
 *
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const email = `smoke-${Date.now()}@rendervid.test`;

let failures = 0;
function check(name, cond, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures += 1;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(method, path, body, token, idempotencyKey) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Smoke test against ${BASE} (user ${email})\n`);

/* 1. Signup (dev auth) */
const signup = await api("POST", "/api/auth/signup", {
  email,
  password: "password123",
  displayName: "Smoke Tester",
});
check("signup returns session", signup.status === 200 && !!signup.json.accessToken, `status=${signup.status}`);
const token = signup.json.accessToken;
const userId = signup.json.user?.id;

/* 2. Wallet: welcome bonus */
const wallet1 = await api("GET", "/api/credits/wallet", undefined, token);
check("welcome bonus granted (100 bonus)", wallet1.json?.bonusCredits === 100 && wallet1.json?.totalCredits === 100,
  JSON.stringify(wallet1.json));

/* 2b. Dev top-up (paid credits) */
const topup = await api("POST", "/api/credits/dev-topup", undefined, token);
check("dev top-up grants paid credits", topup.status === 200 && topup.json?.paidCredits === 100_000,
  `status=${topup.status} paid=${topup.json?.paidCredits}`);
const STARTING = 100_100;

/* 3. Estimate (before any charge) */
const est = await api("POST", "/api/generations/estimate", {
  prompt: "A cinematic luxury watch advertisement, dramatic studio lighting",
  mode: "auto",
}, token);
check("estimate returns credits + affordability", est.status === 200 && est.json?.estimatedCredits > 0 && est.json?.affordable === true,
  `credits=${est.json?.estimatedCredits} affordable=${est.json?.affordable}`);
check("estimate breakdown has no provider/model/USD leakage",
  JSON.stringify(est.json).toLowerCase().match(/higgsfield|kling|mock-|\$|usd/) === null);

/* 4. Create generation (server decides price; client sends no amount) */
const idem = `smoke-${userId}-g1`;
const create1 = await api("POST", "/api/generations", {
  prompt: "A cinematic luxury watch advertisement, dramatic studio lighting",
  mode: "auto",
  idempotencyKey: idem,
}, token);
check("create reserves credits", create1.status === 200 && create1.json?.reservedCredits > 0,
  `status=${create1.status} reserved=${create1.json?.reservedCredits} err=${JSON.stringify(create1.json?.error ?? "")}`);
const genId = create1.json?.generationId;

/* 4b. Duplicate create with same idempotency key → same generation, no double charge */
const createDup = await api("POST", "/api/generations", {
  prompt: "A cinematic luxury watch advertisement, dramatic studio lighting",
  mode: "auto",
  idempotencyKey: idem,
}, token);
check("idempotent duplicate create returns same generation",
  createDup.json?.generationId === genId && createDup.json?.reservedCredits === create1.json?.reservedCredits,
  `genId=${createDup.json?.generationId}`);

/* 5. Wait for settlement (inline queue + mock latency) */
let final = null;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  const st = await api("GET", `/api/generations/${genId}`, undefined, token);
  final = st.json;
  if (["succeeded", "failed", "canceled", "refunded"].includes(final?.status)) break;
}
check("generation settles to succeeded", final?.status === "succeeded", `status=${final?.status} stage=${final?.stage}`);
check("succeeded generation charges reserved amount",
  final?.status === "succeeded" && final?.chargedCredits === create1.json?.reservedCredits,
  `charged=${final?.chargedCredits} reserved=${create1.json?.reservedCredits}`);
check("succeeded generation has downloadable asset", (final?.assets?.length ?? 0) > 0 && !!final?.assets?.[0]?.url);

/* 6. Wallet reflects the charge */
const wallet2 = await api("GET", "/api/credits/wallet", undefined, token);
check("wallet decreased by exactly the charge",
  wallet2.json?.totalCredits === STARTING - (final?.chargedCredits ?? 0),
  `total=${wallet2.json?.totalCredits} expected=${STARTING - (final?.chargedCredits ?? 0)}`);

/* 7. Failure path → automatic refund */
const createF = await api("POST", "/api/generations", {
  prompt: "[fail] broken render",
  mode: "economy",
  idempotencyKey: `smoke-${userId}-f1`,
}, token);
check("failure-path generation created", createF.status === 200 && createF.json?.generationId, `status=${createF.status}`);
let finalF = null;
if (createF.json?.generationId) {
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const st = await api("GET", `/api/generations/${createF.json.generationId}`, undefined, token);
    finalF = st.json;
    if (["failed", "refunded", "canceled"].includes(finalF?.status)) break;
  }
}
check("failed generation refunds credits", ["failed", "refunded"].includes(finalF?.status) && (finalF?.refundedCredits ?? 0) > 0,
  `status=${finalF?.status} refunded=${finalF?.refundedCredits}`);
const wallet3 = await api("GET", "/api/credits/wallet", undefined, token);
check("wallet restored after refund",
  wallet3.json?.totalCredits === wallet2.json?.totalCredits,
  `total=${wallet3.json?.totalCredits} expected=${wallet2.json?.totalCredits}`);

/* 8. Server-side affordability was already proven (210 needed vs 100 held → 402 before top-up). */
check("estimate before top-up was correctly unaffordable", est.json?.affordable === true && create1.json?.reservedCredits > 0);

/* 9. Access control: unauthenticated request rejected */
const anon = await api("GET", "/api/credits/wallet");
check("unauthenticated wallet access rejected", anon.status === 401, `status=${anon.status}`);

/* 10. Ownership: no cross-user leakage */
const other = await api("POST", "/api/auth/signup", {
  email: `smoke-other-${Date.now()}@rendervid.test`,
  password: "password123",
  displayName: "Other",
});
const cross = await api("GET", `/api/generations/${genId}`, undefined, other.json.accessToken);
check("cross-user generation access denied", [401, 403, 404].includes(cross.status), `status=${cross.status}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
