// Chạy store/router và màn lương thật trong Node; chỉ thay native bridge và HTTP.
// Kiểm hành vi người dùng, không gọi API thật hay ghi số tiền ra log.
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
let get = async (month) => ({ cycle: { month, payDate:'2026-10-25', publishedAt:'2026-10-25T10:00:00Z', paidAt:null }, result: { net: 77, workDays: 20, gross: 100, deduction: 23, items: [
  { id:'a', kind:'earning', name:'Thu nhập snapshot', label:'Nhãn từ file', amount:100 },
  { id:'b', kind:'deduction', name:'Khấu trừ snapshot', amount:23 },
] } });
globalThis.__payrollTest = { React, ApiError, payslipApi: {
  list: async () => { calls.push('list'); return { items: [] }; },
  get: async (month) => { calls.push(month); return get(month); },
} };
const noop = `export const empty=async()=>{};`;
const mocks = new Map([
  ['react-native', `export const AppState={currentState:'active',addEventListener:()=>({remove(){}})}, Linking={addEventListener:()=>({remove(){}})}, Vibration={vibrate(){}}, Easing={bezier:()=>()=>{}}, StyleSheet={create:x=>x}, View='View',Pressable='Pressable',TextInput='TextInput';`],
  ['./auth', `${noop} export const authenticate=async()=>({ok:true}), biometricLabel=async()=> 'Face ID', loadSession=async()=>null, quickLoginEmployee=empty,quickRefreshToken=empty,clearQuickLogin=empty,clearSession=empty,loadBioPrefs=empty,loadSupport=empty,saveBioPrefs=empty,saveSession=empty,saveSupport=empty;`],
  ['./attendance', `${noop} export const currentFix=empty,deviceRegistration=empty,deviceSummary=empty,enqueue=empty,flushQueue=empty,installationId=empty,newEventId=empty,quietFix=empty,readQueue=empty;export class LocationError extends Error {}`],
  ['./notify', `${noop} export const clearExplainReminders=empty,scheduleExplainReminders=empty,onReminderTap=()=>()=>{};`],
  ['./api/http', `export const REMOTE=true,ApiError=globalThis.__payrollTest.ApiError,payslipApi=globalThis.__payrollTest.payslipApi;
    export const advanceApi={},announcementsApi={},attendanceApi={},documentsApi={},authApi={},companyApi={},leaveApi={},notificationsApi={},overtimeApi={},timesheetApi={},setTokenSource=()=>{},isNetworkError=()=>false;`],
  ['../api/http', `export const REMOTE=true;`],
  ['../qa', `export const QA_ENABLED=false;`],
  /* src/pin.ts chạy thật trên Keychain giả trong bộ nhớ + SHA-256 của Node */
  ['expo-secure-store', `const m=globalThis.__secureStore??=new Map();export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;
    export const getItemAsync=async k=>m.get(k)??null,setItemAsync=async(k,v)=>{m.set(k,v);},deleteItemAsync=async k=>{m.delete(k);};`],
  ['expo-crypto', `import {createHash,randomBytes} from 'node:crypto';export const CryptoDigestAlgorithm={SHA256:'sha256'};
    export const digestStringAsync=async(a,s)=>createHash(a).update(s).digest('hex'),getRandomBytes=n=>new Uint8Array(randomBytes(n));`],
]);
const components = (names) => names.map((name) => `export const ${name}=p=>globalThis.__payrollTest.React.createElement('${name}',p,p.children??[p.k,p.v,p.title,p.sub]);`).join('\n');
mocks.set('../ui', components('Btn BtnRow Card Chip Chips ErrLine Field InfoRow LinkBtn Ln Note Num Row RowBtn RowStrong SecT SectionHead Spinner St T TbBtn TextArea Timeline'.split(' ')));
mocks.set('../screen', components(['Foot','TopBar']));
mocks.set('../icons', components(['Gi','Ic']));
const output = await build({ stdin: { contents: `export * from './apps/mobile/src/store';export {payslipsSpec,payslipSpec} from './apps/mobile/src/screens/money';`, resolveDir: process.cwd(), loader:'ts' },
  bundle:true, platform:'node', format:'cjs', write:false, jsx:'automatic', plugins:[{name:'native-bridge',setup(b){
    b.onResolve({filter:/.*/},(args)=>mocks.has(args.path)?{path:args.path,namespace:'mock'}:undefined);
    b.onLoad({filter:/.*/,namespace:'mock'},(args)=>({contents:mocks.get(args.path),loader:'js'}));
  }}] });
const module = { exports: {} };
const nativeInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t=nativeInterval(...args);t.unref();return t; };
new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,reactRequire);
const {S,ACT,go,cur,loadPayslips,payslipSpec,payslipsSpec}=module.exports;
const text = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('|');
  if (typeof node.type === 'function') return text(node.type(node.props));
  return text(node.props?.children);
};
const notification=(month)=>({link:{type:'payslip',id:'result-id',no:month}});
S.stack=['home'];S.pinUntil=0;
ACT.notifOpen(notification('2026-10'));
assert.equal(S.sheet.kind,'pin');assert.equal(cur(),'home');assert.deepEqual(calls,[]);
await ACT.faceid();await delay(0);
assert.equal(cur(),'payslip');assert.deepEqual(calls,['2026-10']);assert.equal(S.payslipData.cycle.month,'2026-10');
assert.ok(!S.toast?.msg.includes('Đơn này'));
console.log('✔ Thông báo lương đi qua Face ID rồi tải đúng tháng; không gọi luồng đơn duyệt');
const detailText=text(payslipSpec().body);
assert.ok(detailText.includes('Nhãn từ file'));assert.ok(detailText.includes('20 ngày công'));
assert.ok(!detailText.includes('Vietcombank'));assert.ok(!detailText.includes('09/2026'));
S.hideMoney=true;assert.ok(!text(payslipSpec().body).includes('77 ₫'));S.hideMoney=false;
console.log('✔ Chi tiết dùng nhãn/ngày công từ API, không lẫn dữ liệu ngân hàng mẫu; ẩn tiền hoạt động');
S.stack=['home'];go('payslips');await delay(0);
assert.ok(text(payslipsSpec().body).includes('Chưa có phiếu lương được công bố'));
console.log('✔ Danh sách trống không hiển thị phiếu mẫu');
get=async()=>{throw new ApiError('NOT_FOUND','Không tìm thấy phiếu lương.',404);};
ACT.notifOpen(notification('2026-11'));await delay(0);
assert.equal(S.payslipData,null);assert.ok(text(payslipSpec().body).includes('Không tìm thấy phiếu lương.'));
console.log('✔ Phiếu không tồn tại hiển thị lỗi và không giữ số tiền tháng trước');
const oldCalls=calls.length;ACT.notifOpen(notification('sai-thang'));await delay(0);assert.equal(calls.length,oldCalls);
console.log('✔ Link tháng không hợp lệ bị chặn trước HTTP');
let resolveSlow;get=()=>new Promise(r=>{resolveSlow=r;});
const slow=loadPayslips('2026-10');ACT.logoutGo();resolveSlow({cycle:{month:'2026-10'},result:{net:77}});await slow;
assert.equal(S.payslipData,null);assert.equal(S.payrollData,null);
console.log('✔ Đăng xuất xóa lương và bỏ qua phản hồi cũ đang tải');
globalThis.setInterval=nativeInterval;
