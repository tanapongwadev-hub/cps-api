/**
 * Test real backend by creating a Materials Receiving directly.
 * Then check if the data lands in PostgreSQL.
 */
const http = require("http");
const { Client } = require("pg");
require("dotenv").config();

const API = "http://localhost:3001";
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "cps_database",
};

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        method,
        hostname: "localhost",
        port: 3001,
        path,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function checkDb() {
  const c = new Client(dbConfig);
  await c.connect();
  const r = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM inventory.material_receivings) as recvs,
      (SELECT COUNT(*) FROM inventory.material_receiving_packages) as pkgs
  `);
  await c.end();
  return r.rows[0];
}

(async () => {
  console.log("=== Step 1: Login as superadmin ===");
  const login = await request("POST", "/api/v1/auth/login", {
    username: "superadmin",
    password: "change-me-secure-password",
  });
  console.log("Status:", login.status);
  console.log("Body:", JSON.stringify(login.body, null, 2).slice(0, 500));
  if (login.status !== 200 && login.status !== 201) {
    console.log("Login failed");
    return;
  }
  const token =
    login.body?.data?.authentication?.accessToken ||
    login.body?.accessToken ||
    login.body?.access_token ||
    login.body?.token ||
    login.body?.data?.accessToken;
  console.log("\nGot token:", token ? `yes (${String(token).slice(0, 30)}...)` : "NO");
  if (token) {
    console.log("\n=== Step 2: List materials-receiving (before) ===");
    const before = await request("GET", "/api/v1/materials-receiving?limit=3", null, token);
    console.log("Status:", before.status, "Total:", before.body?.meta?.totalItems);

    console.log("\n=== Step 3: DB before ===");
    console.log(await checkDb());

    // === Step 4: Get lookups (need materialId + supplierId)
    console.log("\n=== Step 4: Get lookups ===");
    const lookups = await request("GET", "/api/v1/materials-receiving/lookups", null, token);
    console.log("Status:", lookups.status);
    if (lookups.status !== 200) {
      console.log("Lookups failed:", JSON.stringify(lookups.body).slice(0, 200));
      return;
    }
    const material = lookups.body?.data?.materials?.[0] || lookups.body?.materials?.[0];
    const supplier = lookups.body?.data?.suppliers?.[0] || lookups.body?.suppliers?.[0];
    console.log("First material:", material ? `${material.code} (${material.id})` : "none");
    console.log("First supplier:", supplier ? `${supplier.code} (${supplier.id})` : "none");
    if (!material || !supplier) {
      console.log("Need material + supplier to test create");
      return;
    }

    // === Step 5: Create receiving
    console.log("\n=== Step 5: Create receiving (1050 qty, packing 200 → 6 packages) ===");
    const today = new Date().toISOString().slice(0, 10);
    const create = await request(
      "POST",
      "/api/v1/materials-receiving",
      {
        materialId: String(material.id),
        supplierId: String(supplier.id),
        receiveQuantity: "1050",
        packingQuantityOverride: 200,
        supplierProductionDate: "2026-08-01",
        receiveDate: today,
        remark: "test from script",
      },
      token,
    );
    console.log("Status:", create.status);
    console.log("Response sample:", JSON.stringify(create.body, null, 2).slice(0, 1000));
    if (create.status === 201 || create.status === 200) {
      const created = create.body?.data || create.body;
      console.log("\n✓ Created ID:", created.id, "Lot:", created.internalLotNo, "Status:", created.status);
      console.log("Packages in response:", created.packages?.length || 0);

      // === Step 6: Check DB after
      console.log("\n=== Step 6: DB after ===");
      console.log(await checkDb());
    }
  }
})();
