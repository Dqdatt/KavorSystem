/* expo-symbols (SF Symbols, chỉ iOS) trên web: vẽ lại 3 biểu tượng app dùng (faceid, touchid, lock) bằng SVG */
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

type Props = { name: string; size?: number; tintColor?: string; weight?: string; style?: StyleProp<ViewStyle> };

export function SymbolView({ name, size = 24, tintColor = "#000", style }: Props) {
  const s = { stroke: tintColor, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === "faceid" ? <>
          <Path {...s} d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2" />
          <Path {...s} d="M8.5 9v1.5M15.5 9v1.5M12 9v4.5h-1M9 16.2c1.8 1.4 4.2 1.4 6 0" />
        </> : name === "touchid" ? <>
          <Path {...s} d="M6.5 5.2A8 8 0 0 1 19.6 9M4.6 9.5a8 8 0 0 0-.5 2.8v1.2M8 20.5c1-1.8 1.5-3.9 1.5-6.2v-2a2.5 2.5 0 0 1 5 0v1.5M12 12.5v2c0 2.6-.7 5-2 7M17 13.8v.7c0 2-.3 3.9-1 5.6M7 11.8a5 5 0 0 1 10 0" />
        </> : <>
          <Rect {...s} x={5} y={10.5} width={14} height={10} rx={2.5} />
          <Path {...s} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </>}
      </Svg>
    </View>
  );
}

export default SymbolView;
