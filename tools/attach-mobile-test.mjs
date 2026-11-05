// Chạy store thật trong Node (khuôn như content-mobile-test.mjs); chỉ thay native bridge, bộ chọn file và HTTP.
// Minh chứng: chọn file cho form (tối đa 3, bỏ file), hủy chọn không làm gì, lỗi chọn file báo toast, thêm vào đơn đang chờ gọi máy chủ
// và cập nhật đơn, mở minh chứng qua liên kết ký.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(realpathSync(resolve('apps/api/node_modules/tsx/package.json')));
const { build } = require('esbuild');
const reactRequire = createRequire(resolve('apps/mobile/package.json'));
class ApiError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
const calls = [], opened = [];
const T = globalThis.__attTest = { ApiError, opened, source: 'library', pick: async () => ({ name: 'giay-kham.jpg', size: 1200, base64: 'AAAA' }), timesheetApi: {
  mine: async () => [], approvals: async () => ({ items: [], canApprove: false }),
  attach: async (id, b) => { calls.push(`attach:${id}:${b.fileName}:${b.dataBase64}`); return { ...req, attachments: [{ id: 'f1', name: b.fileName, type: 'image/jpeg', size: 3, createdAt: '2026-10-31T00:00:00Z' }], canAttach: true }; },
  attachmentUrl: async (id, attId) => { calls.push(`link:${id}:${attId}`); return `http://api.test/api/v1/me/requests/${id}/attachments/${attId}/file?sig=z`; },
} };
const req = { id: 'r1', no: 'NP-0007', type: 'leave', status: 'pending', attachments: [], attachmentRequired: true, canAttach: true, steps: [], payload: { reason: 'Sốt' } };
const noop = `export const empty=async()=>{};`;
const mocks = new Map([
  ['react-native', `export const Alert={alert(){}}, AppState={currentState:'active',addEventListener:()=>({remove(){}})}, Linking={addEventListener:()=>({remove(){}}),openURL:async(u)=>{globalThis.__attTest.opened.push(u);}}, Vibration={vibrate(){}};`],
  ['./auth', `${noop} export const loadLastData=async()=>null,saveLastData=async()=>{},authenticate=async()=>({ok:true}), biometricKind=async()=>({kind:'face',label:'Face ID'}), biometricReady=async()=>false, loadSession=async()=>null, quickLoginEmployee=empty,quickRefreshToken=empty,clearQuickLogin=empty,clearSession=empty,loadBioPrefs=empty,loadSupport=empty,saveBioPrefs=empty,saveSession=empty,saveSupport=empty;`],
  ['./attendance', `${noop} export const currentFix=empty,deviceRegistration=empty,deviceSummary=empty,enqueue=empty,flushQueue=empty,installationId=empty,newEventId=empty,quietFix=empty,readQueue=empty,queuedNow=()=>[],onFix=()=>()=>{},watchFix=async()=>{};export class LocationError extends Error {}`],
  ['./notify', `${noop} export const clearExplainReminders=empty,scheduleExplainReminders=empty,onReminderTap=()=>()=>{};`],
  ['./perms', `${noop} export const readPerms=async()=>({notif:'granted',loc:'granted'}),askFirstRun=async()=>null,askNotif=async()=>'granted',askLoc=async()=>'granted',openSystemSettings=()=>{};`],
  ['./imgcache', `export const cachedImage=()=>null,storeImage=async()=>null,clearImages=()=>{};`],
  ['./attach', `export const chooseSource=async()=>globalThis.__attTest.source,pickAvatar=async()=>null,pickFile=(s)=>globalThis.__attTest.pick(s),sizeText=(n)=>String(n),PICK_MAX_BYTES=5242880;`],
  ['./api/http', `export const REMOTE=true,ApiError=globalThis.__attTest.ApiError,timesheetApi=globalThis.__attTest.timesheetApi;
    export const advanceApi={},announcementsApi={},attendanceApi={},authApi={},companyApi={},documentsApi={},leaveApi={},notificationsApi={},overtimeApi={},payslipApi={},setTokenSource=()=>{},isNetworkError=()=>false;`],
  ['./qa', `export const QA_ENABLED=false;`],
  ['expo-secure-store', `export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1,getItemAsync=async()=>null,setItemAsync=async()=>{},deleteItemAsync=async()=>{};`],
  ['expo-crypto', `export const CryptoDigestAlgorithm={SHA256:'sha256'},digestStringAsync=async()=> '',getRandomBytes=n=>new Uint8Array(n);`],
]);
const output = await build({ stdin: { contents: `export * from './apps/mobile/src/store';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', plugins: [{ name: 'native-bridge', setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => mocks.has(args.path) ? { path: args.path, namespace: 'mock' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: mocks.get(args.path), loader: 'js' }));
  } }] });
const module = { exports: {} };
const nativeInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t = nativeInterval(...args); t.unref(); return t; };
new Function('module', 'exports', 'require', output.outputFiles[0].text)(module, module.exports, reactRequire);
const { S, ACT } = module.exports;
const settle = () => delay(20);

ACT.attPick('ex'); await settle();
assert.deepEqual(S.ex.files.map((f) => f.name), ['giay-kham.jpg'], 'chọn ảnh → thêm vào form giải trình');
for (let i = 0; i < 3; i++) { ACT.attPick('ex'); await settle(); }
assert.equal(S.ex.files.length, 3, 'tối đa 3 file');
assert.match(S.toast?.msg ?? '', /Tối đa 3 file/);
ACT.attRemove('ex', 0); assert.equal(S.ex.files.length, 2, 'bỏ file');
console.log('✔ Form: chọn file, tối đa 3, bỏ file');

T.source = null; ACT.attPick('lv'); await settle();
assert.equal(S.lv.files.length, 0, 'hủy chọn nguồn không làm gì');
T.source = 'camera'; T.pick = async () => { throw new Error('Kavor chưa có quyền dùng camera.'); };
ACT.attPick('lv'); await settle();
assert.equal(S.lv.files.length, 0); assert.equal(S.toast.msg, 'Kavor chưa có quyền dùng camera.', 'lỗi chọn file báo bằng toast');
console.log('✔ Hủy chọn / lỗi quyền camera');

T.pick = async () => ({ name: 'giay-ra-vien.pdf', size: 900, base64: 'JVBERi0=' });
S.reqItems = new Map([[req.no, req]]);
ACT.attPick('NP-0007'); await settle();
assert.deepEqual(calls.filter((c) => c.startsWith('attach')), ['attach:r1:giay-ra-vien.pdf:JVBERi0='], 'thêm vào đơn đang chờ gọi máy chủ đúng đơn');
assert.equal(S.reqItems.get('NP-0007').attachments.length, 1, 'đơn cập nhật danh sách minh chứng');
assert.equal(S.toast.msg, 'Đã thêm minh chứng');
console.log('✔ Thêm minh chứng vào đơn đang chờ');

ACT.attOpen('NP-0007', 'f1'); await settle();
assert.deepEqual([calls.at(-1), opened.at(-1)], ['link:r1:f1', 'http://api.test/api/v1/me/requests/r1/attachments/f1/file?sig=z'], 'mở qua liên kết ký');
console.log('✔ Mở minh chứng bằng trình duyệt hệ thống');
console.log('Tất cả bước minh chứng (mobile) đều đạt.');
process.exit(0);
