// Chạy store/router và màn Bản tin thật trong Node; chỉ thay native bridge và HTTP (khuôn như payroll-mobile-test.mjs).
// Bản tin: mở từ thông báo, mở bài = gọi máy chủ, bài bị gỡ không hiện nội dung cũ, lọc danh mục, mở file, đăng xuất xóa dữ liệu.
// Tài liệu (Hợp đồng và quyết định): qua cổng PIN/Face ID mới tải, mở file qua liên kết ký, lỗi hiển thị, đăng xuất xóa.
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
const calls = [], opened = [];
const today = new Date().toISOString();
const post = (id, extra = {}) => ({ id, category: 'notice', title: `Bài ${id}`, body: 'Đoạn mở đầu.\n\n- Ý một\n- Ý hai', authorLabel: 'Phòng Nhân sự',
  important: false, pinned: false, publishAt: today, attachment: null, readAt: null, ...extra });
let list = async () => ({ items: [post('a1', { category: 'policy', important: true, attachment: { name: 'Quy-dinh.pdf', type: 'application/pdf', size: 412 * 1024 } }), post('a2', { category: 'event' }), post('a3', { publishAt: new Date(Date.now() - 5 * 86400_000).toISOString() })] });
let get = async (id) => ({ ...post(id, { title: 'Quy định mới', attachment: { name: 'Quy-dinh.pdf', type: 'application/pdf', size: 412 * 1024 } }), readAt: today });
let docList = async () => ({ items: [{ id: 'd1', category: 'contract', title: 'HĐLĐ', docNo: null, issuedOn: '2026-01-01', expiresOn: null, expiry: 'none', versionNo: 2, fileName: 'a.pdf', type: 'application/pdf', size: 10, updatedAt: today }] });
globalThis.__newsTest = { React, ApiError, opened, companyApi: {
  profile: async () => { calls.push('profile'); return profile(); },
  profileChange: async (b) => { calls.push('profileChange'); sent.push(b); return changeReply(b); },
}, authApi: { login: async () => { throw new ApiError('AUTH_TENANT_SUSPENDED', 'Công ty đang tạm ngừng sử dụng Kavor. Liên hệ phòng Nhân sự hoặc quản trị viên công ty.', 403); } }, timesheetApi: { mine: async () => { calls.push('mine'); return []; }, approvals: async () => ({ items: [], canApprove: false }) }, documentsApi: {
  list: async () => { calls.push('docs'); return docList(); },
  fileUrl: async (id) => { calls.push(`docfile:${id}`); return `http://api.test/api/v1/me/documents/${id}/file?sig=y`; },
}, announcementsApi: {
  list: async () => { calls.push('list'); return list(); },
  get: async (id) => { calls.push(`get:${id}`); return get(id); },
  fileUrl: async (id) => { calls.push(`file:${id}`); return `http://api.test/api/v1/me/announcements/${id}/file?sig=x`; },
} };
const personal = { personalEmail: null, address: 'Tân Định, TP.HCM', emergency: { name: 'Trần Văn Bình', phone: '0909123456', relation: 'Bố' }, bank: { bankName: 'Vietcombank', holder: 'TRAN THU HA', last4: '6789', accountNo: '0071000006789' } };
let profile = async () => ({ employeeCode: 'HD0142', fullName: 'Trần Thu Hà', department: 'Marketing', phone: '0912345468', personal, pending: null });
const sent = [];
let changeReply = async () => ({ id: 'r1', no: 'HS-0001' });
const noop = `export const empty=async()=>{};`;
const mocks = new Map([
  ['react-native', `export const AppState={currentState:'active',addEventListener:()=>({remove(){}})}, Linking={addEventListener:()=>({remove(){}}),openURL:async(u)=>{globalThis.__newsTest.opened.push(u);}}, Vibration={vibrate(){}}, Easing={bezier:()=>()=>{}}, StyleSheet={create:x=>x}, View='View',Pressable='Pressable',TextInput='TextInput';`],
  ['./auth', `${noop} export const authenticate=async()=>({ok:true}), biometricLabel=async()=> 'Face ID', loadSession=async()=>null, quickLoginEmployee=empty,quickRefreshToken=empty,clearQuickLogin=empty,clearSession=empty,loadBioPrefs=empty,loadSupport=empty,saveBioPrefs=empty,saveSession=empty,saveSupport=empty;`],
  ['./attendance', `${noop} export const currentFix=empty,deviceRegistration=empty,deviceSummary=empty,enqueue=empty,flushQueue=empty,installationId=empty,newEventId=empty,quietFix=empty,readQueue=empty;export class LocationError extends Error {}`],
  ['./notify', `${noop} export const clearExplainReminders=empty,scheduleExplainReminders=empty,onReminderTap=()=>()=>{};`],
  ['./api/http', `export const REMOTE=true,ApiError=globalThis.__newsTest.ApiError,announcementsApi=globalThis.__newsTest.announcementsApi,documentsApi=globalThis.__newsTest.documentsApi,companyApi=globalThis.__newsTest.companyApi,timesheetApi=globalThis.__newsTest.timesheetApi,authApi=globalThis.__newsTest.authApi;
    export const advanceApi={},attendanceApi={},leaveApi={},notificationsApi={},overtimeApi={},payslipApi={},setTokenSource=()=>{},isNetworkError=()=>false;`],
  ['../api/http', `export const REMOTE=true;`],
  ['../qa', `export const QA_ENABLED=false;`],
  /* src/pin.ts chạy thật trên Keychain giả trong bộ nhớ + SHA-256 của Node */
  ['expo-secure-store', `const m=globalThis.__secureStore??=new Map();export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;
    export const getItemAsync=async k=>m.get(k)??null,setItemAsync=async(k,v)=>{m.set(k,v);},deleteItemAsync=async k=>{m.delete(k);};`],
  ['expo-crypto', `import {createHash,randomBytes} from 'node:crypto';export const CryptoDigestAlgorithm={SHA256:'sha256'};
    export const digestStringAsync=async(a,s)=>createHash(a).update(s).digest('hex'),getRandomBytes=n=>new Uint8Array(randomBytes(n));`],
  ['./home', `export const ImpTag=()=>'Quan trọng';`],
]);
const components = (names) => names.map((name) => `export const ${name}=p=>globalThis.__newsTest.React.createElement('${name}',p,p.children??[p.title,p.text,p.label]);`).join('\n');
mocks.set('../ui', components('Balanced Card Chip Chips Empty Row Spinner T'.split(' ')));
mocks.set('../screen', components(['TabHead','TopBar']));
mocks.set('../icons', components(['Gi','Ic']));
mocks.set('../theme', `export const C=new Proxy({},{get:()=>'#000'}),F=new Proxy({},{get:()=>'f'}),GL=new Proxy({},{get:()=>''});`);
const output = await build({ stdin: { contents: `export * from './apps/mobile/src/store';export {newsSpec,newsDetailSpec,recentNewsViews} from './apps/mobile/src/screens/news';`, resolveDir: process.cwd(), loader:'ts' },
  bundle:true, platform:'node', format:'cjs', write:false, jsx:'automatic', plugins:[{name:'native-bridge',setup(b){
    b.onResolve({filter:/.*/},(args)=>mocks.has(args.path)?{path:args.path,namespace:'mock'}:undefined);
    b.onLoad({filter:/.*/,namespace:'mock'},(args)=>({contents:mocks.get(args.path),loader:'js'}));
  }}] });
const module = { exports: {} };
const nativeInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t=nativeInterval(...args);t.unref();return t; };
new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,reactRequire);
const {S,ACT,tab,cur,loadAnnouncements,newsSpec,newsDetailSpec,recentNewsViews}=module.exports;
const text = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('|');
  if (typeof node.type === 'function') return text(node.type(node.props));
  return text(node.props?.children);
};

S.stack=['home'];
ACT.notifOpen({link:{type:'announcement',id:'a9',no:null}});
assert.equal(cur(),'newsDetail');assert.equal(text(newsDetailSpec().body).includes('Quy định mới'),false,'chưa tải xong không hiện nội dung');
await delay(0);
assert.deepEqual(calls,['get:a9']);
const detail=text(newsDetailSpec().body);
assert.ok(detail.includes('Quy định mới'));assert.ok(detail.includes('Ý một'));assert.ok(detail.includes('Quy-dinh.pdf'));assert.ok(detail.includes('412 KB'));
assert.ok(detail.includes(String(new Date().getFullYear())),"năm lấy từ ngày đăng, không cứng 2026 của prototype");
console.log('✔ Thông báo bản tin mở đúng bài, tải từ máy chủ (ghi đã đọc), nội dung tách đoạn/gạch đầu dòng');

ACT.openNewsFile('a9','Quy-dinh.pdf');await delay(0);await delay(0);
assert.deepEqual(opened,['http://api.test/api/v1/me/announcements/a9/file?sig=x']);
console.log('✔ File đính kèm mở bằng liên kết ký qua trình duyệt hệ thống');

get=async()=>{throw new ApiError('NOT_FOUND','Không tìm thấy bản tin.',404);};
ACT.openNews('a1');
assert.ok(!text(newsDetailSpec().body).includes('Quy định mới'),'không hiện bài trước khi mở bài khác');
await delay(0);
assert.ok(text(newsDetailSpec().body).includes('Bài viết không còn hoặc không gửi tới bạn.'));
console.log('✔ Bài đã gỡ/không gửi tới mình hiện lỗi, không giữ nội dung bài trước');

S.stack=['home'];tab('news');await delay(0);
assert.ok(calls.includes('list'));
let listText=text(newsSpec().body);
assert.ok(listText.includes('Bài a2'));
S.newsCat='event';listText=text(newsSpec().body);assert.ok(listText.includes('Bài a2'));assert.ok(!listText.includes('Bài a1'));S.newsCat='all';
assert.deepEqual(recentNewsViews().map((n)=>n.key),['a1','a2'],'bài 5 ngày trước không lên Trang chủ');
assert.equal(recentNewsViews()[0].rel,'Hôm nay');
console.log('✔ Tab Bản tin đọc danh sách API, lọc danh mục; Trang chủ chỉ lấy bài 2 ngày gần nhất');

let release;list=()=>new Promise(r=>{release=r;});
const slow=loadAnnouncements();ACT.logoutGo();release({items:[post('z9')]});await slow;
assert.equal(S.annData,null);assert.equal(S.annDetail,null);
console.log('✔ Đăng xuất xóa bản tin và bỏ qua phản hồi cũ đang tải');
S.stack=['login'];S.stack=['profile'];S.pinUntil=0;calls.length=0;
module.exports.go('docs');
assert.equal(S.sheet?.kind,'pin','tài liệu cần PIN/Face ID như phiếu lương');assert.deepEqual(calls,[]);
await ACT.faceid();await delay(0);
assert.equal(cur(),'docs');assert.deepEqual(calls,['docs']);assert.equal(S.docData.items[0].title,'HĐLĐ');
console.log('✔ Hợp đồng và quyết định chỉ tải sau PIN/Face ID');
ACT.openDoc('d1');await delay(0);await delay(0);
assert.equal(opened.at(-1),'http://api.test/api/v1/me/documents/d1/file?sig=y');
console.log('✔ Mở tài liệu bằng liên kết ký qua trình duyệt hệ thống');
docList=async()=>{throw new ApiError('INTERNAL_ERROR','Hệ thống đang gặp sự cố.',500);};
await module.exports.loadDocuments();
assert.equal(S.docData,null);assert.equal(S.docError,'Hệ thống đang gặp sự cố.');
let releaseDoc;docList=()=>new Promise(r=>{releaseDoc=r;});
const slowDoc=module.exports.loadDocuments();ACT.logoutGo();releaseDoc({items:[{id:'z'}]});await slowDoc;
assert.equal(S.docData,null);
console.log('✔ Lỗi tải tài liệu không giữ danh sách cũ; đăng xuất bỏ phản hồi đang tải');
S.stack=['home'];calls.length=0;S.sheet=null;
module.exports.go('profile');await delay(0);
assert.deepEqual(calls,['profile']);assert.equal(S.profile.fullName,'Trần Thu Hà');
ACT.editProfile();
assert.equal(S.sheet?.kind,'editProfile');
assert.deepEqual([S.f.pfPhone,S.f.pfAddr,S.f.pfEmRel,S.f.pfAcc,S.f.pfHolder],['0912345468','Tân Định, TP.HCM','Bố','0071000006789','TRAN THU HA'],'form điền sẵn thông tin đã duyệt');
console.log('✔ "Đề nghị sửa" mở form điền sẵn hồ sơ hiện tại');
changeReply=async()=>{throw new ApiError('VALIDATION_ERROR','Số tài khoản gồm 6–20 chữ số.',400);};
S.f.pfAcc='12ab';calls.length=0;ACT.pfSend();await delay(0);await delay(0);
assert.equal(S.sheet?.kind,'editProfile','lỗi kiểm tra giữ form mở');assert.equal(S.f.pfErr,'Số tài khoản gồm 6–20 chữ số.');
changeReply=async()=>({id:'r1',no:'HS-0001'});
profile=async()=>({ employeeCode: 'HD0142', fullName: 'Trần Thu Hà', department: 'Marketing', phone: '0912345468', personal, pending: { id: 'r1', no: 'HS-0001', fields: ['address', 'bank'] } });
S.f.pfAcc='19012345 6789';S.f.pfAddr=' Quận 1 ';S.f.pfEmName='';S.f.pfEmPhone='';S.f.pfEmRel='';S.f.pfReason='Đổi tài khoản';calls.length=0;
ACT.pfSend();await delay(0);await delay(0);await delay(0);
assert.deepEqual(sent.at(-1),{phone:'0912345468',personalEmail:'',address:'Quận 1',reason:'Đổi tài khoản',emergency:null,bank:{bankName:'Vietcombank',accountNo:'19012345 6789',holder:'TRAN THU HA'}});
assert.equal(S.sheetShow,false,'gửi xong đóng form');assert.ok(S.toast.msg.includes('HR duyệt'));
assert.ok(calls.includes('profile')&&calls.includes('mine'),'tải lại hồ sơ và đơn của tôi');assert.equal(S.profile.pending.no,'HS-0001');
console.log('✔ Gửi đề nghị: lỗi hiện trong form; thành công đóng form, tải lại hồ sơ có đề nghị đang chờ');
ACT.openPendingProfile();await delay(0);await delay(0);
assert.equal(cur(),'reqDetail');assert.equal(S.param,'HS-0001');
ACT.logoutGo();assert.equal(S.profile,null);
console.log('✔ Mở đề nghị đang chờ từ Hồ sơ; đăng xuất xóa hồ sơ');
S.f.lgId='bich@maub.test';S.f.lgPw='Mat-khau-1';ACT.login();await delay(0);await delay(0);
assert.equal(S.err?.kind,'disabled');assert.equal(S.err.over.t,'Công ty tạm ngừng sử dụng Kavor');assert.ok(S.err.over.p.includes('tạm ngừng'));assert.equal(S.f.lgPw,'');
console.log('✔ Công ty bị Kavor tạm khóa: đăng nhập hiện màn lỗi riêng, không báo nhầm là tài khoản bị khóa');
globalThis.setInterval=nativeInterval;
