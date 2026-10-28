import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCENT } from './lib/supabase';

export const C = {
  bg: '#f4f6f2',
  surface: '#ffffff',
  ink: '#16201a',
  muted: '#5b6960',
  line: '#dde3dc',
  accent: ACCENT,
  accentSoft: ACCENT + '1f',
  warn: '#b86e00',
  warnSoft: '#fcefd2',
  bad: '#b93a26',
  badSoft: '#f8e1dc',
  good: '#0d7a4e',
  goodSoft: '#e0f0e7',
};

export function Screen({ title, subtitle, onBack, right, children, footer, scroll = true, refreshing, onRefresh }) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? {
        contentContainerStyle: [s.body, { paddingBottom: 24 + (footer ? 0 : insets.bottom) }],
        keyboardShouldPersistTaps: 'handled',
        refreshControl: onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[C.accent]} />
        ) : undefined,
      }
    : { style: [s.body, { flex: 1 }] };
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {title ? (
        <View style={s.header}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={s.back} accessibilityLabel="Go back">
              <Text style={s.backText}>‹</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <Body {...bodyProps}>{children}</Body>
      {footer ? <View style={[s.footer, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', loading, disabled, small, style }) {
  const off = disabled || loading;
  const k = BTN[kind];
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: k.bg, borderColor: k.border },
        off && { opacity: 0.5 },
        pressed && !off && { opacity: 0.8 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
    >
      {loading ? (
        <ActivityIndicator color={k.fg} />
      ) : (
        <Text style={[s.btnText, small && { fontSize: 14 }, { color: k.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}
const BTN = {
  primary: { bg: C.accent, fg: '#fff', border: C.accent },
  ghost: { bg: 'transparent', fg: C.ink, border: C.line },
  danger: { bg: C.badSoft, fg: C.bad, border: C.badSoft },
  soft: { bg: C.accentSoft, fg: C.accent, border: 'transparent' },
};

export function Card({ children, style, onPress, accent }) {
  const inner = (
    <View style={[s.card, accent && { borderLeftWidth: 4, borderLeftColor: accent }, style]}>{children}</View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {inner}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...props }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor="#9aa59e" style={s.input} {...props} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone = 'accent' }) {
  const t = {
    accent: [C.accentSoft, C.accent],
    good: [C.goodSoft, C.good],
    warn: [C.warnSoft, C.warn],
    bad: [C.badSoft, C.bad],
    mute: [C.bg, C.muted],
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: t[0] }]}>
      <Text style={[s.pillText, { color: t[1] }]}>{text}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'warn' }) {
  const bg = { warn: C.warnSoft, bad: C.badSoft, good: C.goodSoft }[tone];
  const fg = { warn: '#6b4300', bad: C.bad, good: C.good }[tone];
  return (
    <View style={[s.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function Empty({ text }) {
  return (
    <View style={s.empty}>
      <Text style={{ color: C.muted, textAlign: 'center', lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator size="large" color={C.accent} />
    </View>
  );
}

export function Thumb({ uri, letter, size = 56, color }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: C.bg }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: color || C.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{(letter || '?')[0]}</Text>
    </View>
  );
}

export function Qty({ qty, onAdd, onRemove, max }) {
  if (!qty) {
    return (
      <Pressable onPress={onAdd} style={s.add} accessibilityLabel="Add to cart">
        <Text style={{ color: C.accent, fontWeight: '800' }}>ADD</Text>
      </Pressable>
    );
  }
  return (
    <View style={s.qty}>
      <Pressable onPress={onRemove} hitSlop={8} style={s.qtyBtn} accessibilityLabel="Remove one">
        <Text style={s.qtyText}>−</Text>
      </Pressable>
      <Text style={s.qtyText}>{qty}</Text>
      <Pressable
        onPress={max != null && qty >= max ? undefined : onAdd}
        hitSlop={8}
        style={[s.qtyBtn, max != null && qty >= max && { opacity: 0.4 }]}
        accessibilityLabel="Add one"
      >
        <Text style={s.qtyText}>+</Text>
      </Pressable>
    </View>
  );
}

export function ToggleRow({ label, sub, value, onChange, disabled }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{label}</Text>
        {sub ? <Text style={s.small}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: C.accent, false: C.line }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <View style={s.tabs}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[s.tab, on && { backgroundColor: C.ink }]}>
            <Text style={[s.tabText, on && { color: '#fff' }]}>
              {t.label}
              {t.badge ? ` (${t.badge})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stat({ label, value, tone }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone === 'warn' && { color: C.warn }]}>{value}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, lineHeight: 34, color: C.accent, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800', color: C.ink },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 1 },
  body: { padding: 16, gap: 12 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 8,
  },
  btn: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  btnSmall: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: '700', color: C.muted },
  hint: { fontSize: 12, color: C.muted },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.ink,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  banner: { borderRadius: 12, padding: 12 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 14,
    padding: 24,
  },
  add: {
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  qty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.accent,
    borderRadius: 10,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  qtyText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  strong: { fontSize: 16, fontWeight: '700', color: C.ink },
  text: { fontSize: 15, color: C.ink, lineHeight: 21 },
  small: { fontSize: 13, color: C.muted, lineHeight: 18 },
  h2: { fontSize: 18, fontWeight: '800', color: C.ink },
  tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tabText: { fontWeight: '700', color: C.ink, fontSize: 14 },
  stat: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
  },
  statLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: '800', color: C.ink, marginTop: 2 },
  price: { fontSize: 16, fontWeight: '800', color: C.ink },
  mrp: { fontSize: 13, color: C.muted, textDecorationLine: 'line-through' },
  otp: { fontSize: 30, fontWeight: '800', letterSpacing: 8, color: C.ink },
});
