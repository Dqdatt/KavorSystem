const path = require("path");
const SHIM_RN = path.resolve(__dirname, "shims/react-native.ts");
const SHIMMED = new Set(["Platform", "Alert", "useWindowDimensions", "Dimensions", "Linking", "Keyboard", "Vibration", "LogBox"]);

/* babel-preset-expo trên web có plugin babel-plugin-react-native-web chạy trước và viết lại
   `import { StyleSheet, View } from "react-native"` thành các import tới `"react-native-web/dist/exports/StyleSheet"`...
   Plugin này bắt ở Program.exit (sau khi preset đã tách xong) để trỏ các export cần ghi đè về `shims/react-native.ts`,
   đồng thời đổi `experimental_backgroundImage` thành `backgroundImage`. */
function kavorPwaTransform({ types: t }) {
  return {
    visitor: {
      Program: {
        exit(programPath, state) {
          const file = state.filename || "";
          if (file === SHIM_RN || file.includes("node_modules")) return;
          for (const stmt of programPath.get("body")) {
            if (!stmt.isImportDeclaration()) continue;
            const src = stmt.node.source.value;
            if (src === "react-native") {
              stmt.node.source.value = SHIM_RN;
              continue;
            }
            if (src.startsWith("react-native-web/dist/exports/")) {
              const name = src.slice("react-native-web/dist/exports/".length).split("/")[0];
              if (SHIMMED.has(name)) {
                stmt.node.source.value = SHIM_RN;
                for (const sp of stmt.node.specifiers) {
                  if (t.isImportDefaultSpecifier(sp)) {
                    const local = sp.local;
                    Object.assign(sp, t.importSpecifier(local, t.identifier(name)));
                  }
                }
              }
            }
          }
        },
      },
      ObjectProperty(p) {
        const k = p.node.key;
        if (!p.node.computed && ((t.isIdentifier(k) && k.name === "experimental_backgroundImage") || (t.isStringLiteral(k) && k.value === "experimental_backgroundImage"))) {
          p.node.key = t.identifier("backgroundImage");
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  const preset = require.resolve("babel-preset-expo", { paths: [require.resolve("expo/package.json")] });
  return { presets: [preset], plugins: [kavorPwaTransform] };
};
