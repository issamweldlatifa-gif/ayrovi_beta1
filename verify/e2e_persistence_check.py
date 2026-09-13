#!/usr/bin/env python3
"""
E2E persistence check — Website <-> CRM integration audit.

Mode `create`:
  1. Read public trust-bar (baseline, anonymous).
  2. Admin login (CRM) and edit the "Authentique" trust item description.
  3. Read public trust-bar again (anonymous) -> edit MUST be visible.
  4. Customer OTP login (console provider), add to cart, checkout -> order.
  5. Verify the order is visible in the CRM (admin API), in the customer API,
     and directly in the SQLite file.

Mode `restart-check`:
  6. Re-read public trust-bar (anonymous): the edit MUST still be there.
  7. Re-read the order in CRM + customer API + SQLite file.

Any failure => non-zero exit code.
"""
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import http.cookiejar
import uuid

BASE = os.environ.get("AYROVI_BASE", "http://localhost:3000")


def _db_path_from_env_file():
    """Mirror the server's DATABASE_PATH resolution (.env, then default)."""
    root = os.path.join(os.path.dirname(__file__), "..")
    env_file = os.path.abspath(os.path.join(root, ".env"))
    value = None
    if os.path.exists(env_file):
        for line in open(env_file):
            line = line.strip()
            if line.startswith("DATABASE_PATH="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
    value = value or "data/qatafo.sqlite"
    if os.path.isabs(value):
        return value
    return os.path.abspath(os.path.join(root, value))


DB_PATH = os.environ.get("AYROVI_DB_PATH") or _db_path_from_env_file()
MARKER = os.path.join(os.path.dirname(__file__), ".e2e-marker.json")
ADMIN_EMAIL = "admin@ayrovi.tn"
ADMIN_PASSWORD = "AyroviBeta2026!"
TEST_PHONE = os.environ.get("E2E_PHONE", "21620123457")


class Client:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))

    def request(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            resp = self.opener.open(req, timeout=30)
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return e.code, {"raw": raw}


def check(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))
    return bool(ok)


def as_list(payload):
    data = (payload or {}).get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("items") or data.get("orders") or []
    return []


def db_query(sql, params=()):
    con = sqlite3.connect(DB_PATH)
    try:
        con.row_factory = sqlite3.Row
        rows = [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()
    return rows


def public_trust_item(client, title):
    status, body = client.request("GET", "/api/public/trust-bar")
    if status != 200:
        return None, status, body
    items = body.get("data", {}).get("items") if isinstance(body.get("data"), dict) else body.get("data")
    if items is None:
        items = body.get("data") or []
    for item in items or []:
        if str(item.get("title", "")).strip() == title:
            return item, status, body
    return None, status, body


def create_phase():
    print("== PHASE 1 — create (before restart) ==")
    anon = Client()
    all_ok = True

    # 1. baseline (anonymous visitor, no login)
    item, status, _ = public_trust_item(anon, "Authentique")
    all_ok &= check("Public trust-bar readable without login (anonymous)", status == 200 and item is not None,
                    f"status={status}")
    if not item:
        sys.exit(1)
    baseline_desc = item.get("description", "")
    print(f"         baseline description: {baseline_desc!r}")

    # 2. admin login (CRM)
    admin = Client()
    status, body = admin.request("POST", "/api/admin/auth/login",
                                 {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    all_ok &= check("Admin login (CRM)", status == 200 and body.get("success"), f"status={status}")
    csrf = (body.get("data") or {}).get("csrfToken", "")
    if not csrf:
        sys.exit(1)

    # public endpoint omits ids — resolve the item id through the CRM API
    status, body = admin.request("GET", "/api/admin/trust-bar")
    admin_items = (body.get("data") or {}).get("items") or []
    admin_item = next((i for i in admin_items if str(i.get("title", "")).strip() == "Authentique"), None)
    if not admin_item:
        print(f"         admin trust-bar body={str(body)[:300]}")
        sys.exit(1)

    # 3. edit content from CRM
    marker = f"E2E-UNIQUE-{int(time.time())}"
    status, body = admin.request("PUT", f"/api/admin/trust-bar/items/{admin_item['id']}",
                                 {"title": "Authentique", "description": marker, "icon": "ShieldCheck",
                                  "enabled": True},
                                 {"x-csrf-token": csrf})
    all_ok &= check("CRM save content (PUT trust item)", status == 200 and body.get("success"),
                    f"status={status} body={str(body)[:200]}")

    # 4. anonymous website sees the change (no login)
    item2, status, _ = public_trust_item(anon, "Authentique")
    all_ok &= check("Website (anonymous) shows the CRM edit immediately",
                    item2 is not None and item2.get("description") == marker,
                    f"now={item2.get('description') if item2 else None!r}")

    # 5. customer OTP login
    guest_session = f"ayrovi-e2e-{uuid.uuid4()}"
    cust = Client()
    status, body = cust.request("POST", "/api/customer/auth/otp/request", {"phone": TEST_PHONE})
    dev_code = (body.get("data") or {}).get("developmentCode")
    all_ok &= check("Customer OTP request (console provider)", bool(status == 201 and dev_code), f"status={status}")
    if not dev_code:
        print(f"         body={str(body)[:300]}")
        sys.exit(1)
    challenge_id = (body.get("data") or {}).get("challengeId", "")

    status, body = cust.request("POST", "/api/customer/auth/otp/verify",
                                {"challengeId": challenge_id, "code": dev_code,
                                 "cartSessionId": guest_session})
    cust_csrf = (body.get("data") or {}).get("csrfToken", "")
    all_ok &= check("Customer OTP verify -> session", status == 200 and body.get("success") and cust_csrf,
                    f"status={status}")

    # 6. add to cart
    status, body = cust.request("POST", "/api/cart/items",
                                {"store": "shein", "url": "https://www.shein.com/e2e-test-product",
                                 "title": "E2E Produit de test", "imageUrl": "", "sourcePrice": 21.99,
                                 "sourceCurrency": "EUR", "quantity": 1},
                                {"x-session-id": guest_session, "x-csrf-token": cust_csrf})
    all_ok &= check("Add to cart (persisted)", status == 201, f"status={status} body={str(body)[:200]}")

    # 7. checkout
    status, body = cust.request("POST", "/api/checkout",
                                {"name": "Client Test", "email": "client.test@example.com",
                                 "phone": "20 123 456", "city": "Tunis",
                                 "address": "12 Rue de l'Audit, Apt 3",
                                 "paymentMethod": "PENDING_SELECTION",
                                 "latitude": None, "longitude": None,
                                 "termsAccepted": True, "locale": "fr-TN"},
                                {"x-session-id": guest_session, "x-csrf-token": cust_csrf})
    order_number = (body or {}).get("orderNumber")
    order_id = (body or {}).get("orderId")
    all_ok &= check("Checkout creates order", status == 200 and body.get("success") and order_number,
                    f"status={status} order={order_number} body={str(body)[:250]}")

    # 8. order visible in CRM (admin)
    status, body = admin.request("GET", "/api/admin/orders")
    orders = as_list(body)
    found = [o for o in orders if o.get("order_number") == order_number]
    all_ok &= check("CRM (admin API) shows the new order", status == 200 and bool(found),
                    f"status={status} rows={len(orders)}")

    # 9. order visible for the customer (account API)
    status, body = cust.request("GET", "/api/customer/account/orders")
    rows = as_list(body)
    found_c = [o for o in rows if o.get("order_number") == order_number or o.get("orderNumber") == order_number]
    all_ok &= check("Customer account API shows the order", status == 200 and bool(found_c),
                    f"status={status} rows={len(rows)}")

    # 10. order directly in the SQLite file
    rows = db_query("SELECT id, order_number, status, total_tnd FROM orders WHERE order_number=?", (order_number,))
    all_ok &= check("Order row present in SQLite file", len(rows) == 1,
                    f"rows={rows} db={DB_PATH}")

    json.dump({"marker": marker, "trustItemId": admin_item["id"], "orderNumber": order_number,
               "orderId": order_id, "baselineDesc": baseline_desc}, open(MARKER, "w"))
    print(f"== marker saved: {MARKER} ==")
    print(f"== PHASE 1 {'OK' if all_ok else 'FAILED'} — now restart the backend and run --restart-check ==")
    return 0 if all_ok else 1


def restart_phase():
    if not os.path.exists(MARKER):
        print("marker file missing — run --create first")
        return 1
    marker = json.load(open(MARKER))
    print("== PHASE 2 — after backend restart ==")
    all_ok = True

    anon = Client()
    item, status, _ = public_trust_item(anon, "Authentique")
    desc = item.get("description") if item else None
    all_ok &= check("Website (anonymous) STILL shows the CRM edit after restart",
                    desc == marker["marker"],
                    f"expected={marker['marker']!r} got={desc!r}"
                    + ("  <-- BUG: value reverted to a stale default" if desc == marker.get("baselineDesc") else ""))

    admin = Client()
    status, body = admin.request("POST", "/api/admin/auth/login",
                                 {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    csrf = (body.get("data") or {}).get("csrfToken", "")
    all_ok &= check("Admin re-login after restart", status == 200 and body.get("success"), f"status={status}")

    status, body = admin.request("GET", "/api/admin/orders")
    orders = as_list(body)
    found = [o for o in orders if o.get("order_number") == marker["orderNumber"]]
    all_ok &= check("CRM STILL shows the order after restart", status == 200 and bool(found),
                    f"status={status} rows={len(orders)}")

    rows = db_query("SELECT id, order_number, status FROM orders WHERE order_number=?",
                    (marker["orderNumber"],))
    all_ok &= check("Order STILL in SQLite file after restart", len(rows) == 1, f"rows={rows}")

    print(f"== PHASE 2 {'OK' if all_ok else 'FAILED'} ==")
    return 0 if all_ok else 1


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "--create"
    if mode == "--create":
        sys.exit(create_phase())
    elif mode == "--restart-check":
        sys.exit(restart_phase())
    else:
        print(__doc__)
        sys.exit(2)
