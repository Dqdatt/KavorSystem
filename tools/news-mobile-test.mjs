// Chạy store/router và màn Bản tin thật trong Node; chỉ thay native bridge và HTTP (khuôn như payroll-mobile-test.mjs).
// Kiểm: mở từ thông báo, mở bài = gọi máy chủ, bài bị gỡ không hiện nội dung cũ, lọc danh mục, mở file, đăng xuất xóa dữ liệu.
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
globalThis.__newsTest = { React, ApiError, opened, announcementsApi: {
  list: async () => { calls.push('list'); return list(); },
  get: async (id) => { calls.push(`get:${id}`); return get(id); },
  fileUrl: async (id) => { calls.push(`file:${id}`); return `http://api.test/api/v1/me/announcements/${id}/file?sig=x`; },
} };
const noop = `export const empty=async()=>{};`;
const mocks = new Map([
  ['react-native', `export const AppState={currentState:'active',addEventListener:()=>({remove(){}})}, Linking={addEventListener:()=>({remove(){}}),openURL:async(u)=>{globalThis.__newsTest.opened.push(u);}}, Vibration={vibrate(){}}, Easing={bezier:()=>()=>{}}, StyleSheet={create:x=>x}, View='View',Pressable='Pressable',TextInput='TextInput';`],
  ['./auth', `${noop} export const authenticate=async()=>({ok:true}), biometricLabel=async()=> 'Face ID', loadSession=async()=>null, quickLoginEmployee=empty,quickRefreshToken=empty,clearQuickLogin=empty,clearSession=empty,loadBioPrefs=empty,loadSupport=empty,saveBioPrefs=empty,saveSession=empty,saveSupport=empty;`],
  ['./attendance', `${noop} export const currentFix=empty,deviceRegistration=empty,deviceSummary=empty,enqueue=empty,flushQueue=empty,installationId=empty,newEventId=empty,quietFix=empty,readQueue=empty;export class LocationError extends Error {}`],
  ['./notify', `${noop} export const clearExplainReminders=empty,scheduleExplainReminders=empty,onReminderTap=()=>()=>{};`],
  ['./api/http', `export const REMOTE=true,ApiError=globalThis.__newsTest.ApiError,announcementsApi=globalThis.__newsTest.announcementsApi;
    export const advanceApi={},attendanceApi={},authApi={},companyApi={},leaveApi={},notificationsApi={},overtimeApi={},payslipApi={},timesheetApi={},setTokenSource=()=>{},isNetworkError=()=>false;`],
  ['../api/http', `export const REMOTE=true;`],
  ['../qa', `export const QA_ENABLED=false;`],
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
globalThis.setInterval=nativeInterval;
