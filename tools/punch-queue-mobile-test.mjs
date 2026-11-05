// Hàng đợi chấm công trên máy (apps/mobile/src/attendance.ts): lưu trước rồi mới gửi.
// Kiểm: mất mạng thì giữ lại; gửi trong 2 phút dùng giờ máy chủ, quá 2 phút gửi dạng offline kèm giờ trên máy;
// máy chủ từ chối thì bỏ khỏi hàng đợi và báo; lần chấm công thêm vào trong lúc đang gửi không bị mất.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(realpathSync(resolve('apps/api/node_modules/tsx/package.json')));
const { build } = require('esbuild');
const mocks = new Map([
  ['react-native', `export const Platform={OS:'ios'};`],
  ['expo-device', `export const modelName='iPhone 11',osVersion='18',deviceName=null;`],
  ['expo-location', `export const Accuracy={High:4};`],
  ['expo-crypto', `import {randomUUID as r} from 'node:crypto';export const randomUUID=()=>r();`],
  ['expo-secure-store', `const m=globalThis.__secureStore??=new Map();export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;
    export const getItemAsync=async k=>m.get(k)??null,setItemAsync=async(k,v)=>{m.set(k,v);},deleteItemAsync=async k=>{m.delete(k);};`],
]);
const output = await build({ stdin: { contents: `export * from './apps/mobile/src/attendance';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'error', plugins: [{ name: 'native', setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => (mocks.has(a.path) ? { path: a.path, namespace: 'mock' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({ contents: mocks.get(a.path), loader: 'js' }));
  } }] });
const module = { exports: {} };
new Function('module', 'exports', 'require', output.outputFiles[0].text)(module, module.exports, require);
const { enqueue, flushQueue, queuedNow, readQueue, newEventId } = module.exports;
class NetErr extends Error {}
const isNet = (e) => e instanceof NetErr;
const punch = (kind, at = new Date().toISOString()) => ({ clientEventId: newEventId(), kind, installationId: 'i1', latitude: 10.7, longitude: 106.6, accuracyM: 5, occurredAt: at });

// 1. Lưu trước khi gửi: tắt app ngay sau khi bấm thì vẫn còn trên máy (đọc lại từ Keychain giả)
const a = punch('out');
await enqueue(a);
assert.equal(queuedNow().length, 1);
assert.equal((await readQueue())[0].clientEventId, a.clientEventId);
console.log('✔ Bấm chấm công: lưu vào máy trước khi gửi');

// 2. Mất mạng: giữ nguyên, lần sau gửi lại
let r = await flushQueue(async () => { throw new NetErr(); }, isNet);
assert.equal(r.remaining, 1); assert.equal(r.sent.length, 0); assert.equal(queuedNow().length, 1);
console.log('✔ Mất mạng: vẫn giữ trên máy để gửi lại');

// 3. Gửi được trong 2 phút: dạng trực tuyến (máy chủ dùng giờ của máy chủ), không gửi giờ trên máy
const seen = [];
r = await flushQueue(async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.equal(r.sent.length, 1); assert.equal(r.remaining, 0); assert.equal(queuedNow().length, 0);
assert.equal(seen[0].offline, undefined); assert.equal(seen[0].occurredAt, undefined); assert.equal(seen[0].clientEventId, a.clientEventId);
console.log('✔ Gửi ngay: dạng trực tuyến, xóa khỏi máy');

// 4. Quá 2 phút mới gửi được: dạng offline kèm giờ bấm trên máy
const old = punch('in', '2026-11-04T10:30:00.000Z');
await enqueue(old);
const q = JSON.parse(globalThis.__secureStore.get('kavor.punchQueue')); q[0].queuedAt -= 10 * 60_000;
globalThis.__secureStore.set('kavor.punchQueue', JSON.stringify(q));
seen.length = 0;
r = await flushQueue(async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.equal(seen[0].offline, true); assert.equal(seen[0].occurredAt, '2026-11-04T10:30:00.000Z');
console.log('✔ Gửi muộn: dạng offline với giờ bấm trên máy');

// 5. Máy chủ từ chối (lỗi nghiệp vụ): bỏ khỏi hàng đợi, trả về để app báo người dùng
await enqueue(punch('out'));
r = await flushQueue(async () => { throw new Error('Bạn chưa vào ca hôm nay.'); }, isNet);
assert.equal(r.failed.length, 1); assert.equal(r.remaining, 0); assert.equal(queuedNow().length, 0);
console.log('✔ Máy chủ từ chối: bỏ khỏi máy và báo lại');

// 6. Bấm thêm trong lúc đang gửi: lần mới không bị ghi đè mất
const first = punch('in'), second = punch('out');
await enqueue(first);
r = await flushQueue(async () => { await enqueue(second); return { status: 'accepted' }; }, isNet);
assert.deepEqual(queuedNow().map((p) => p.clientEventId), [second.clientEventId]); assert.equal(r.remaining, 1);
console.log('✔ Chấm công thêm trong lúc đang gửi: vẫn còn trên máy');
console.log('Tất cả bước hàng đợi chấm công (mobile) đều đạt.');
