import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, type StyleProp, type ViewStyle } from "react-native";
import { EASE, SPRING } from "./theme";

let reducedNow = false;
export function useReducedMotion() {
  const [reduced, setReduced] = useState(reducedNow);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reducedNow = v; setReduced(v); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => { reducedNow = v; setReduced(v); });
    return () => sub.remove();
  }, []);
  return reduced;
}

/* @keyframes rise: opacity 0, translateY 12px → none, .55s ease; delay theo thứ tự con của .scroll */
const RISE_DELAYS = [40, 90, 140, 190, 240, 290, 340, 380];
export function Rise({ index, enabled, children, style, duration = 550, distance = 12 }: { index: number; enabled: boolean; children: ReactNode; style?: StyleProp<ViewStyle>; duration?: number; distance?: number }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(enabled && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!enabled || reduced) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration, delay: RISE_DELAYS[Math.min(index, RISE_DELAYS.length - 1)], easing: EASE, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>{children}</Animated.View>;
}

/* .appear: opacity 0, translateY(-4px) → none .3s */
export function Appear({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 300, delay, easing: EASE, useNativeDriver: true }).start(); }, []);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] }]}>{children}</Animated.View>;
}

/* .morph: opacity .1, translateY 8px → none .55s — chạy lại mỗi khi `trigger` đổi */
export function Morph({ trigger, children, style }: { trigger: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 550, easing: EASE, useNativeDriver: true }).start();
  }, [trigger]);
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}

/* @keyframes shake */
export function useShake(trigger: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [trigger]);
  return { transform: [{ translateX: v.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -7, 7, -7, 7, 0] }) }] };
}

/* .just → @keyframes pick (spring) */
export function usePick() {
  const v = useRef(new Animated.Value(1)).current;
  const run = () => {
    v.setValue(0.93);
    Animated.sequence([
      Animated.timing(v, { toValue: 1.03, duration: 216, easing: SPRING, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 144, easing: SPRING, useNativeDriver: true }),
    ]).start();
  };
  return { style: { transform: [{ scale: v }] }, run };
}

export function usePress(scaleTo = 0.975, duration = 150) {
  const v = useRef(new Animated.Value(1)).current;
  return {
    style: { transform: [{ scale: v }] },
    onPressIn: () => Animated.timing(v, { toValue: scaleTo, duration, useNativeDriver: true }).start(),
    onPressOut: () => Animated.timing(v, { toValue: 1, duration, useNativeDriver: true }).start(),
  };
}
