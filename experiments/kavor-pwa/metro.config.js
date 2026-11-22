/* Metro cho bản PWA thử nghiệm.
   - Dùng chung mã app ở apps/mobile/src (chỉ đọc) và node_modules của app (symlink ./node_modules).
   - Import "react-native" / module native từ mã app được chuyển sang ./shims (bản web).
   - Không ảnh hưởng apps/mobile: cấu hình này chỉ dùng khi chạy trong thư mục experiments/kavor-pwa. */
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const ROOT = path.resolve(__dirname, "../..");
const MOBILE = path.join(ROOT, "apps/mobile");
const MOBILE_MODULES = path.join(MOBILE, "node_modules");
const APP_SRC = path.join(MOBILE, "src") + path.sep;
const SHIMS = path.join(__dirname, "shims") + path.sep;

const config = getDefaultConfig(__dirname);
config.watchFolders = [MOBILE, path.join(ROOT, "packages/contracts"), path.join(ROOT, "node_modules")];
config.resolver.nodeModulesPaths = [MOBILE_MODULES, path.join(ROOT, "node_modules")];
config.resolver.unstable_enableSymlinks = true;
config.resolver.extraNodeModules = {
  "react-native": path.join(SHIMS, "react-native.ts"),
};
/* pnpm có nhiều bản react (19.2.3 của mobile và 19.3.0 của web HR): ghim mọi import react/react-dom về đúng bản của mobile */
const PINNED_PKGS = new Set(["react", "react-dom", "react-native-web", "react-native-svg"]);

/* Module được thay khi import từ mã app (hoặc từ shim khác) */
const MODULE_SHIMS = {
  "react-native": "react-native.ts",
  "expo-secure-store": "secure-store.ts",
  "expo-local-authentication": "local-authentication.ts",
  "expo-symbols": "symbols.tsx",
  "expo-notifications": "notifications.ts",
  "expo-splash-screen": "splash-screen.ts",
  "expo-status-bar": "status-bar.tsx",
  "react-native-safe-area-context": "safe-area-context.tsx",
  "expo-device": "device.ts",
};
/* File của app được thay nguyên file (khác biệt nền tảng quá lớn) */
const FILE_SHIMS = {
  [path.join(APP_SRC, "imgcache.ts")]: "imgcache.ts",
  [path.join(APP_SRC, "attach.ts")]: "attach.ts",
};

const fromApp = (origin) => origin.startsWith(APP_SRC) || origin.startsWith(SHIMS) || origin === path.join(__dirname, "index.ts") || origin === path.join(MOBILE, "App.tsx");

/* getDefaultConfig(expo) gắn sẵn customResolver cho web (đổi react-native → react-native-web trước khi gọi resolveRequest),
   nên phải giữ lại prevResolve và bọc bên ngoài nó. */
const prevResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, name, platform) => {
  const base = prevResolve ? { ...ctx, resolveRequest: prevResolve } : ctx;
  const origin = ctx.originModulePath;
  const pkgRoot = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
  /* babel-plugin-react-native-web đổi `import { StyleSheet } from "react-native"` thành `"react-native-web/dist/exports/StyleSheet"`,
     nên bắt riêng từng export mà shims/react-native.ts ghi đè khi gọi từ mã app. */
  const SHIMMED_EXPORTS = new Set(["Platform", "Alert", "useWindowDimensions", "Dimensions", "Linking", "Keyboard", "Vibration", "LogBox", "ScrollView"]);
  const rnwSub = name.startsWith("react-native-web/dist/exports/") ? name.slice("react-native-web/dist/exports/".length).split("/")[0] : null;
  if ((name === "react-native" || name === "react-native-web" || (rnwSub && SHIMMED_EXPORTS.has(rnwSub))) && fromApp(origin) && origin !== path.join(SHIMS, "react-native.ts")) {
    return { type: "sourceFile", filePath: path.join(SHIMS, "react-native.ts") };
  }
  /* Shim tự import module gốc (vd shims/device.ts → expo-device) thì trả về module thật, không vòng lại chính nó */
  if (MODULE_SHIMS[name] && fromApp(origin) && origin !== path.join(SHIMS, MODULE_SHIMS[name])) {
    return { type: "sourceFile", filePath: path.join(SHIMS, MODULE_SHIMS[name]) };
  }
  if (PINNED_PKGS.has(pkgRoot)) {
    return base.resolveRequest({ ...base, originModulePath: path.join(MOBILE, "index.js") }, name, platform);
  }
  const res = base.resolveRequest(base, name, platform);
  if (res.type === "sourceFile" && FILE_SHIMS[res.filePath]) return { type: "sourceFile", filePath: path.join(SHIMS, FILE_SHIMS[res.filePath]) };
  return res;
};

module.exports = config;
