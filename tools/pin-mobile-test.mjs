// Cổng mã PIN (docs/plans/mobile-ui-feedback.md mục 3): chạy store + src/pin.ts thật trong Node, Keychain giả trong bộ nhớ.
// Kiểm: lần đầu phải tạo PIN (nhập 2 lần, chặn PIN yếu), sai PIN bị đếm và khóa sau 5 lần, Face ID xóa đếm sai, quên/đổi PIN.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(realpathSync(resolve('apps/api/node_modules/tsx/package.json')));
const { build } = require('esbuild');
const reactRequire = createRequire(resolve('apps/mobile/package.json'));
const React = reactRequire('react');
class ApiError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
const calls = [];
globalThis.__pinTest = { React, ApiError, session: { employeeId: 'HD0142' }, bio: { ok: true },
  payslipApi: { list: async () => { calls.push('list'); return { items: [] }; }, get: async () => { calls.push('get'); return null; } } };
const noop = `export const empty=async()=>{};`;
const mocks = new Map([
  ['react-native', `export const Alert={alert(){}}, AppState={currentState:'active',addEventListener:()=>({remove(){}})}, Linking={addEventListener:()=>({remove(){}})}, Vibration={vibrate(){}}, Easing={bezier:()=>()=>{}}, StyleSheet={create:x=>x}, View='View',Pressable='Pressable',TextInput='TextInput';`],
  ['./auth', `${noop} export const authenticate=async()=>globalThis.__pinTest.bio, biometricLabel=async()=> 'Face ID', biometricKind=async()=>({kind:'face',label:'Face ID'}), biometricReady=async()=>false, loadSession=async()=>globalThis.__pinTest.session, quickLoginEmployee=empty,quickRefreshToken=empty,clearQuickLogin=empty,clearSession=async()=>{globalThis.__pinTest.loggedOut=true;},loadBioPrefs=empty,loadSupport=empty,saveBioPrefs=empty,saveSession=empty,saveSupport=empty;`],
  ['./attendance', `${noop} export const currentFix=empty,deviceRegistration=empty,deviceSummary=empty,enqueue=empty,flushQueue=empty,installationId=empty,newEventId=empty,quietFix=empty,readQueue=empty;export class LocationError extends Error {}`],
  ['./notify', `${noop} export const clearExplainReminders=empty,scheduleExplainReminders=empty,onReminderTap=()=>()=>{};`],
  ['./perms', `${noop} export const readPerms=async()=>({notif:'granted',loc:'granted'}),askFirstRun=async()=>null,askNotif=async()=>'granted',askLoc=async()=>'granted',openSystemSettings=()=>{};`],
  ['./api/http', `export const REMOTE=true,ApiError=globalThis.__pinTest.ApiError,payslipApi=globalThis.__pinTest.payslipApi;
    export const advanceApi={},announcementsApi={},attendanceApi={},documentsApi={},authApi={logout:async()=>{}},companyApi={},leaveApi={},notificationsApi={},overtimeApi={},timesheetApi={},setTokenSource=()=>{},isNetworkError=()=>false;`],
  ['../api/http', `export const REMOTE=true;`],
  ['../qa', `export const QA_ENABLED=false;`],
  ['expo-secure-store', `const m=globalThis.__secureStore??=new Map();export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;
    export const getItemAsync=async k=>m.get(k)??null,setItemAsync=async(k,v)=>{m.set(k,v);},deleteItemAsync=async k=>{m.delete(k);};`],
  ['expo-crypto', `import {createHash,randomBytes} from 'node:crypto';export const CryptoDigestAlgorithm={SHA256:'sha256'};
    export const digestStringAsync=async(a,s)=>createHash(a).update(s).digest('hex'),getRandomBytes=n=>new Uint8Array(randomBytes(n));`],
]);
const components = (names) => names.map((name) => `export const ${name}=p=>globalThis.__pinTest.React.createElement('${name}',p,p.children);`).join('\n');
mocks.set('../ui', components('Btn BtnRow Card Chip Chips ErrLine Field InfoRow LinkBtn Ln Note Num Row RowBtn RowStrong SecT SectionHead Spinner St T TbBtn TextArea Timeline'.split(' ')));
mocks.set('../screen', components(['Foot','TopBar']));
mocks.set('../icons', components(['Gi','Ic']));
const output = await build({ stdin: { contents: `export * from './apps/mobile/src/store';`, resolveDir: process.cwd(), loader:'ts' },
  bundle:true, platform:'node', format:'cjs', write:false, jsx:'automatic', plugins:[{name:'native-bridge',setup(b){
    b.onResolve({filter:/.*/},(args)=>mocks.has(args.path)?{path:args.path,namespace:'mock'}:undefined);
    b.onLoad({filter:/.*/,namespace:'mock'},(args)=>({contents:mocks.get(args.path),loader:'js'}));
  }}] });
const module = { exports: {} };
const nativeInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t=nativeInterval(...args);t.unref();return t; };
new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,reactRequire);
const { S, ACT, go, cur } = module.exports;
const store = globalThis.__secureStore;
const PIN_KEY = 'kavor.pin.HD0142';
const type = async (pin) => { for (const d of pin) ACT.pinkey(d); await delay(320); };
const gate = async () => { S.stack = ['home']; S.pinUntil = 0; go('payslips'); await delay(10); };

await gate();
assert.equal(S.sheet?.kind, 'pin'); assert.equal(S.pinMode, 'create', 'chưa có PIN → tạo PIN, không nhận 6 số bất kỳ');
await type('111111'); assert.equal(S.pinMode, 'create'); assert.match(S.pinErr, /giống nhau/);
await type('123456'); assert.equal(S.pinMode, 'create'); assert.match(S.pinErr, /liên tiếp/);
await type('204816'); assert.equal(S.pinMode, 'confirm');
await type('204817'); assert.equal(S.pinMode, 'create'); assert.match(S.pinErr, /không khớp/); assert.equal(cur(), 'home');
await type('204816'); await type('204816');
assert.equal(cur(), 'payslips'); assert.ok(store.has(PIN_KEY)); assert.ok(!store.get(PIN_KEY).includes('204816'), 'không lưu PIN dạng rõ');
console.log('✔ Lần đầu tạo PIN: chặn PIN yếu, nhập lại phải khớp, xong mới vào phiếu lương; chỉ lưu bản băm có muối');

await gate();
assert.equal(S.pinMode, 'enter');
await type('999999'); assert.equal(cur(), 'home'); assert.match(S.pinErr, /Còn 4 lần/);
await type('204816'); assert.equal(cur(), 'payslips');
assert.equal(JSON.parse(store.get(PIN_KEY)).failures, 0);
console.log('✔ PIN sai bị từ chối và đếm lần; đúng thì mở và xóa đếm sai');

await gate();
await type('999999'); await type('999998');
assert.deepEqual(S.bio, { login: false, unlock: false }, 'bản dùng API: Face ID mặc định tắt');
await ACT.faceid(); await delay(10);
assert.equal(cur(), 'home'); assert.match(S.toast.msg, /đang tắt/);
console.log('✔ Face ID mặc định tắt: bấm Face ID trong sheet PIN chỉ nhắc bật trong Bảo mật và thiết bị');
S.bio = { login: true, unlock: true };
await ACT.faceid(); await delay(10);
assert.equal(cur(), 'payslips'); assert.equal(JSON.parse(store.get(PIN_KEY)).failures, 0);
console.log('✔ Face ID thành công mở lương và xóa đếm sai của PIN');

await gate();
let release; globalThis.__pinTest.bio = new Promise((r) => { release = r; });
const pending = ACT.faceid(); await delay(10);
assert.equal(S.sheet?.kind, 'pin', 'đang chờ hộp thoại Face ID của hệ thống: không chuyển sang màn tự vẽ');
release({ ok: false, reason: 'cancelled', message: '' }); await pending; await delay(10);
assert.equal(S.sheet?.kind, 'pin'); assert.equal(cur(), 'home');
globalThis.__pinTest.bio = { ok: true };
await type('204816'); assert.equal(cur(), 'payslips');
console.log('✔ Face ID gọi thẳng hộp thoại hệ thống; hủy thì vẫn ở bàn phím PIN');

await gate();
globalThis.__pinTest.loggedOut = false;
for (const p of ['900001', '900002', '900003', '900004']) await type(p);
assert.match(S.pinErr, /Còn 1 lần/);
await type('900005');
assert.ok(!store.has(PIN_KEY)); assert.equal(cur(), 'login'); assert.ok(globalThis.__pinTest.loggedOut); assert.match(S.toast.msg, /sai mã PIN 5 lần/);
console.log('✔ Sai 5 lần: xóa PIN và đăng xuất, phải đăng nhập lại');

await gate();
assert.equal(S.pinMode, 'create', 'sau khi bị khóa, lần sau phải tạo PIN mới');
await type('314159'); await type('314159'); assert.equal(cur(), 'payslips');
S.stack = ['home', 'profile', 'security']; ACT.changePin(); await delay(10);
assert.equal(S.pinMode, 'old');
await type('271828'); assert.equal(S.pinMode, 'old'); assert.match(S.pinErr, /Sai mã PIN/);
await type('314159'); assert.equal(S.pinMode, 'create'); assert.ok(S.pinChange);
await type('271828'); await type('271828');
assert.equal(S.toast.msg, 'Đã đổi mã PIN'); assert.equal(cur(), 'security');
await gate(); await type('314159'); assert.equal(cur(), 'home', 'PIN cũ không còn dùng được');
await type('271828'); assert.equal(cur(), 'payslips');
console.log('✔ Đổi PIN ở Bảo mật: phải nhập đúng PIN hiện tại; PIN cũ hết hiệu lực');

await gate(); ACT.forgotPin(); await delay(10);
assert.ok(!store.has(PIN_KEY)); assert.equal(cur(), 'login');
console.log('✔ Quên PIN: xóa PIN trên máy và đăng xuất để xác thực lại');
globalThis.setInterval = nativeInterval;
