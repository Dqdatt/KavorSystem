/* Kiểm shim nhớ quyền vị trí trên iOS PWA (shims/geo-perm.ts). Chạy: node --test tools/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { patchGeoPermission, KEY } from "../shims/geo-perm.ts";

function createStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function createNav(handlers = {}) {
  let watchIdSeq = 200;
  return {
    geolocation: {
      getCurrentPosition: (success, error, opts) => {
        if (handlers.onGetCurrentPosition) {
          handlers.onGetCurrentPosition(success, error, opts);
        }
      },
      watchPosition: (success, error, opts) => {
        const id = ++watchIdSeq;
        if (handlers.onWatchPosition) {
          handlers.onWatchPosition(success, error, opts, id);
        }
        return id;
      },
    },
    permissions: {
      query: async (desc) => {
        if (handlers.onQuery) return handlers.onQuery(desc);
        return { state: "prompt", name: desc.name };
      },
    },
  };
}

test("permissions.query: có cờ + prompt -> granted; không cờ + prompt -> prompt; có cờ + denied -> denied", async () => {
  // 1. Có cờ + query thật "prompt" -> granted
  const store1 = createStore({ [KEY]: "1" });
  const nav1 = createNav({
    onQuery: async (desc) => ({ state: "prompt", name: desc.name }),
  });
  patchGeoPermission(nav1, store1);
  const res1 = await nav1.permissions.query({ name: "geolocation" });
  assert.equal(res1.state, "granted");
  assert.equal(res1.name, "geolocation");

  // 2. Không cờ + query thật "prompt" -> prompt
  const store2 = createStore();
  const nav2 = createNav({
    onQuery: async (desc) => ({ state: "prompt", name: desc.name }),
  });
  patchGeoPermission(nav2, store2);
  const res2 = await nav2.permissions.query({ name: "geolocation" });
  assert.equal(res2.state, "prompt");

  // 3. Có cờ + query thật "denied" -> denied
  const store3 = createStore({ [KEY]: "1" });
  const nav3 = createNav({
    onQuery: async (desc) => ({ state: "denied", name: desc.name }),
  });
  patchGeoPermission(nav3, store3);
  const res3 = await nav3.permissions.query({ name: "geolocation" });
  assert.equal(res3.state, "denied");
});

test("getCurrentPosition: thành công -> có cờ; lỗi code 1 -> mất cờ; lỗi code 3 -> giữ nguyên cờ", () => {
  // Thành công -> có cờ
  const store = createStore();
  let successCalled = false;
  const nav1 = createNav({
    onGetCurrentPosition: (success) => {
      success({ coords: { latitude: 10.7, longitude: 106.7 } });
    },
  });
  patchGeoPermission(nav1, store);
  nav1.geolocation.getCurrentPosition((pos) => {
    successCalled = true;
    assert.equal(pos.coords.latitude, 10.7);
  });
  assert.equal(successCalled, true);
  assert.equal(store.getItem(KEY), "1");

  // Lỗi code 1 (PERMISSION_DENIED) -> mất cờ
  let err1Called = false;
  const nav2 = createNav({
    onGetCurrentPosition: (_success, error) => {
      error({ code: 1, message: "User denied" });
    },
  });
  patchGeoPermission(nav2, store);
  nav2.geolocation.getCurrentPosition(
    () => {},
    (err) => {
      err1Called = true;
      assert.equal(err.code, 1);
    }
  );
  assert.equal(err1Called, true);
  assert.equal(store.getItem(KEY), null);

  // Đặt lại cờ rồi gặp lỗi code 3 (TIMEOUT) -> cờ giữ nguyên
  store.setItem(KEY, "1");
  let err3Called = false;
  const nav3 = createNav({
    onGetCurrentPosition: (_success, error) => {
      error({ code: 3, message: "Timeout" });
    },
  });
  patchGeoPermission(nav3, store);
  nav3.geolocation.getCurrentPosition(
    () => {},
    (err) => {
      err3Called = true;
      assert.equal(err.code, 3);
    }
  );
  assert.equal(err3Called, true);
  assert.equal(store.getItem(KEY), "1");
});

test("watchPosition: trả đúng id của hàm gốc và đặt cờ khi thành công", () => {
  const store = createStore();
  let successCalled = false;
  const nav = createNav({
    onWatchPosition: (success, _error, _opts, id) => {
      success({ coords: { latitude: 10.7, longitude: 106.7 } });
    },
  });
  patchGeoPermission(nav, store);
  const watchId = nav.geolocation.watchPosition((pos) => {
    successCalled = true;
    assert.equal(pos.coords.latitude, 10.7);
  });
  assert.equal(watchId, 201);
  assert.equal(successCalled, true);
  assert.equal(store.getItem(KEY), "1");
});

test("query cho name: notifications -> trả nguyên kết quả thật", async () => {
  const store = createStore({ [KEY]: "1" });
  const rawResult = { state: "prompt", name: "notifications" };
  const nav = createNav({
    onQuery: async (desc) => rawResult,
  });
  patchGeoPermission(nav, store);
  const res = await nav.permissions.query({ name: "notifications" });
  assert.strictEqual(res, rawResult);
});

test("patch hai lần -> callback gốc chỉ được gọi một lần", () => {
  const store = createStore();
  let rawCalls = 0;
  const nav = createNav({
    onGetCurrentPosition: (success) => {
      rawCalls++;
      success({ coords: { latitude: 10, longitude: 106 } });
    },
  });

  patchGeoPermission(nav, store);
  patchGeoPermission(nav, store);

  let appCalls = 0;
  nav.geolocation.getCurrentPosition(() => {
    appCalls++;
  });

  assert.equal(rawCalls, 1);
  assert.equal(appCalls, 1);
});
