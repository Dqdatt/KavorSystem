// Hàng đợi chấm công trên máy (apps/mobile/src/attendance.ts): lưu trước rồi mới gửi.
// Kiểm: mất mạng thì giữ lại; gửi trong 2 phút dùng giờ máy chủ, quá 2 phút gửi dạng offline kèm giờ trên máy;
// máy chủ từ chối thì bỏ khỏi hàng đợi và báo; lần chấm công thêm vào trong lúc đang gửi không bị mất;
// máy dùng chung: người khác đăng nhập không gửi hộ/không thấy; lỗi tạm thời (chờ đồng ý, máy chờ duyệt, 429) giữ lại.
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
    const w=()=>new Promise(r=>setTimeout(r,1));
    export const getItemAsync=async k=>{await w();return m.get(k)??null;},setItemAsync=async(k,v)=>{await w();m.set(k,v);},deleteItemAsync=async k=>{await w();m.delete(k);};`],
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
await enqueue(a, 'A');
assert.equal(queuedNow('A').length, 1);
assert.equal((await readQueue('A'))[0].clientEventId, a.clientEventId);
console.log('✔ Bấm chấm công: lưu vào máy trước khi gửi');

// 2. Mất mạng: giữ nguyên, lần sau gửi lại
let r = await flushQueue('A', async () => { throw new NetErr(); }, isNet);
assert.equal(r.remaining, 1); assert.equal(r.sent.length, 0); assert.equal(queuedNow('A').length, 1);
console.log('✔ Mất mạng: vẫn giữ trên máy để gửi lại');

// 3. Gửi được trong 2 phút: dạng trực tuyến (máy chủ dùng giờ của máy chủ), không gửi giờ trên máy
const seen = [];
r = await flushQueue('A', async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.equal(r.sent.length, 1); assert.equal(r.remaining, 0); assert.equal(queuedNow('A').length, 0);
assert.equal(seen[0].offline, undefined); assert.equal(seen[0].occurredAt, undefined); assert.equal(seen[0].emp, undefined); assert.equal(seen[0].clientEventId, a.clientEventId);
console.log('✔ Gửi ngay: dạng trực tuyến, xóa khỏi máy');

// 4. Quá 2 phút mới gửi được: dạng offline kèm giờ bấm trên máy
const old = punch('in', '2026-11-04T10:30:00.000Z');
await enqueue(old, 'A');
const q = JSON.parse(globalThis.__secureStore.get('kavor.punchQueue')); q[0].queuedAt -= 10 * 60_000;
globalThis.__secureStore.set('kavor.punchQueue', JSON.stringify(q));
seen.length = 0;
r = await flushQueue('A', async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.equal(seen[0].offline, true); assert.equal(seen[0].occurredAt, '2026-11-04T10:30:00.000Z');
console.log('✔ Gửi muộn: dạng offline với giờ bấm trên máy');

// 5. Máy chủ từ chối (lỗi nghiệp vụ): bỏ khỏi hàng đợi, trả về để app báo người dùng
await enqueue(punch('out'), 'A');
r = await flushQueue('A', async () => { throw new Error('Bạn chưa vào ca hôm nay.'); }, isNet);
assert.equal(r.failed.length, 1); assert.equal(r.remaining, 0); assert.equal(queuedNow('A').length, 0);
console.log('✔ Máy chủ từ chối: bỏ khỏi máy và báo lại');

// 6. Bấm thêm trong lúc đang gửi: lần mới không bị ghi đè mất
const first = punch('in'), second = punch('out');
await enqueue(first, 'A');
r = await flushQueue('A', async () => { await enqueue(second, 'A'); return { status: 'accepted' }; }, isNet);
assert.deepEqual(queuedNow('A').map((p) => p.clientEventId), [second.clientEventId]); assert.equal(r.remaining, 1);
console.log('✔ Chấm công thêm trong lúc đang gửi: vẫn còn trên máy');
await flushQueue('A', async () => ({ status: 'accepted' }), isNet);

// 7. Máy dùng chung: A chấm offline rồi đăng xuất, B đăng nhập → B không gửi hộ, không thấy giờ của A; A đăng nhập lại thì gửi
const ofA = punch('in');
await enqueue(ofA, 'A');
seen.length = 0;
r = await flushQueue('B', async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.equal(seen.length, 0); assert.equal(r.remaining, 0); assert.equal(queuedNow('B').length, 0); assert.equal((await readQueue('B')).length, 0);
const ofB = punch('in');
await enqueue(ofB, 'B');
r = await flushQueue('B', async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.deepEqual(seen.map((p) => p.clientEventId), [ofB.clientEventId]);
assert.deepEqual(queuedNow('A').map((p) => p.clientEventId), [ofA.clientEventId]);
seen.length = 0;
r = await flushQueue('A', async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.deepEqual(seen.map((p) => p.clientEventId), [ofA.clientEventId]); assert.equal((await readQueue('A')).length, 0);
console.log('✔ Máy dùng chung: người sau không gửi hộ, người chấm đăng nhập lại thì gửi');

// 8. Bản ghi cũ (trước khi có mã NV) vẫn được người đang đăng nhập gửi
const legacy = punch('out');
globalThis.__secureStore.set('kavor.punchQueue', JSON.stringify([{ ...legacy, offline: true, queuedAt: Date.now() }]));
seen.length = 0;
r = await flushQueue('B', async (p) => { seen.push(p); return { status: 'accepted' }; }, isNet);
assert.deepEqual(seen.map((p) => p.clientEventId), [legacy.clientEventId]); assert.equal(r.remaining, 0);
console.log('✔ Bản ghi cũ chưa gắn mã NV: không mất');

// 9. Lỗi tạm thời (keep trả true, vd chờ đồng ý điều khoản): giữ lại, không báo từ chối
class Consent extends Error {}
await enqueue(punch('in'), 'A');
r = await flushQueue('A', async () => { throw new Consent(); }, (e) => isNet(e) || e instanceof Consent);
assert.equal(r.failed.length, 0); assert.equal(r.remaining, 1);
await flushQueue('A', async () => ({ status: 'accepted' }), isNet);
console.log('✔ Lỗi tạm thời: vẫn giữ trên máy để gửi lại');

// 10. Bấm chấm công đúng lúc lượt gửi đang ghi lại hàng đợi: không mất lần mới, không gửi lại lần đã xong
const x = punch('in'), c = punch('out'), d = punch('out');
await enqueue(x, 'A');
await Promise.all([flushQueue('A', async () => ({ status: 'accepted' }), isNet), enqueue(c, 'A'), enqueue(d, 'A')]);
assert.deepEqual((await readQueue('A')).map((p) => p.clientEventId).sort(), [c.clientEventId, d.clientEventId].sort());
console.log('✔ Chấm công cùng lúc với lượt gửi: không mất, không trùng');
console.log('Tất cả bước hàng đợi chấm công (mobile) đều đạt.');
