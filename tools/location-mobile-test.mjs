// Chấm công khi công ty chưa áp dụng địa điểm: chạy store thật trong Node, API/GPS giả.
// Kiểm: không nhầm thành "ngoài vùng"; "Tải lại" hỏi lại máy chủ; HR áp dụng xong thì nhận địa điểm và tính khoảng cách.
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
const KHO = { id: 'loc-1', name: 'Kho thành phẩm Bà Hom', address: '63 Lê Đình Cẩn', latitude: 10.757075, longitude: 106.603789, radiusM: 50, maxAccuracyM: 60 };
const day = (locations) => ({ date: '2026-10-30', timezone: 'Asia/Ho_Chi_Minh', shift: null, locations, events: [], clockIn: null, clockOut: null,
  device: { id: 'd1', status: 'active', platform: 'ios', deviceModel: 'iPhone 11', osVersion: null, registeredAt: '2026-10-29T15:43:54Z', decisionReason: null } });
globalThis.__locTest = { React, ApiError, session: { employeeId: 'NV001' }, bio: { ok: true }, locations: [], todayCalls: 0,
  fix: { latitude: 10.757080, longitude: 106.603790, accuracyM: 4 },
  attendanceApi: { today: async () => { globalThis.__locTest.todayCalls++; return day(globalThis.__locTest.locations); } } };
const noop = `export const empty=async()=>{};`;
const mocks = new Map([
  ['react-native', `export const Alert={alert(){}}, AppState={currentState:'active',addEventListener:()=>({remove(){}})}, Linking={addEventListener:()=>({remove(){}})}, Vibration={vibrate(){}}, Easing={bezier:()=>()=>{}}, StyleSheet={create:x=>x}, View='View',Pressable='Pressable',TextInput='TextInput';`],
  ['./auth', `${noop} export const authenticate=async()=>globalThis.__locTest.bio, biometricLabel=async()=> 'Face ID', biometricKind=async()=>({kind:'face',label:'Face ID'}), biometricReady=async()=>false, loadSession=async()=>globalThis.__locTest.session, quickLoginEmployee=empty,quickRefreshToken=empty,clearQuickLogin=empty,clearSession=async()=>{globalThis.__locTest.loggedOut=true;},loadBioPrefs=empty,loadSupport=empty,saveBioPrefs=empty,saveSession=empty,saveSupport=empty;`],
  ['./attendance', `${noop} export const currentFix=async()=>globalThis.__locTest.fix,deviceRegistration=empty,deviceSummary=empty,enqueue=empty,flushQueue=empty,installationId=empty,newEventId=empty,quietFix=async()=>globalThis.__locTest.fix,readQueue=empty;export class LocationError extends Error {}`],
  ['./notify', `${noop} export const clearExplainReminders=empty,scheduleExplainReminders=empty,onReminderTap=()=>()=>{};`],
  ['./perms', `${noop} export const readPerms=async()=>({notif:'granted',loc:'granted'}),askFirstRun=async()=>null,askNotif=async()=>'granted',askLoc=async()=>'granted',openSystemSettings=()=>{};`],
  ['./api/http', `export const REMOTE=true,ApiError=globalThis.__locTest.ApiError,attendanceApi=globalThis.__locTest.attendanceApi;
    export const advanceApi={},announcementsApi={},payslipApi={},documentsApi={},authApi={logout:async()=>{}},companyApi={},leaveApi={},notificationsApi={},overtimeApi={},timesheetApi={},setTokenSource=()=>{},isNetworkError=()=>false;`],
  ['../api/http', `export const REMOTE=true;`],
  ['../qa', `export const QA_ENABLED=false;`],
  ['expo-secure-store', `const m=globalThis.__secureStore??=new Map();export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;
    export const getItemAsync=async k=>m.get(k)??null,setItemAsync=async(k,v)=>{m.set(k,v);},deleteItemAsync=async k=>{m.delete(k);};`],
  ['expo-crypto', `import {createHash,randomBytes} from 'node:crypto';export const CryptoDigestAlgorithm={SHA256:'sha256'};
    export const digestStringAsync=async(a,s)=>createHash(a).update(s).digest('hex'),getRandomBytes=n=>new Uint8Array(randomBytes(n));`],
]);
const components = (names) => names.map((name) => `export const ${name}=p=>globalThis.__locTest.React.createElement('${name}',p,p.children);`).join('\n');
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
new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,reactRequire);
const { S, ACT, loadToday, noLocation } = module.exports;
const T = globalThis.__locTest;
S.stack = ['home', 'clock'];

await loadToday();
assert.equal(noLocation(), true, 'không có địa điểm áp dụng → trạng thái "chưa có địa điểm"');
assert.equal(S.inRange, false, 'vẫn chặn chấm công');
console.log('✔ Công ty chưa áp dụng địa điểm: app biết là "chưa có địa điểm", không phải "ngoài vùng"');

ACT.relocate(); await delay(20);
assert.equal(T.todayCalls, 2, '"Tải lại" hỏi lại máy chủ');
assert.match(S.toast.msg, /vẫn chưa áp dụng địa điểm/);
assert.equal(noLocation(), true);
console.log('✔ Bấm "Tải lại" khi HR chưa áp dụng: báo vẫn chưa có, không báo "vẫn ngoài vùng"');

T.locations = [KHO];
ACT.relocate(); await delay(20);
assert.equal(noLocation(), false);
assert.equal(S.att.loc.name, KHO.name);
assert.equal(S.inRange, true, 'vị trí cách kho < 1 m');
assert.match(S.toast.msg, /Đã có địa điểm chấm công · bạn đang trong vùng/);
console.log('✔ HR áp dụng xong rồi bấm "Tải lại": nhận địa điểm, tính khoảng cách, mở nút chấm công');

T.fix = { latitude: 10.757968, longitude: 106.60414, accuracyM: 4 };
ACT.relocate(); await delay(20);
assert.equal(S.inRange, false);
assert.match(S.toast.msg, /Vẫn ngoài vùng · cách 10\d(,\d)?\sm/);
assert.equal(noLocation(), false, 'có địa điểm mà ở xa → "ngoài vùng" như cũ');
console.log('✔ Có địa điểm nhưng ở xa: vẫn là "ngoài vùng" với khoảng cách');
console.log('Tất cả bước địa điểm chấm công (mobile) đều đạt.');
