import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  paper: '#F7F3EA',
  ink: '#24251F',
  muted: '#74746A',
  orange: '#BD4626',
  line: '#DDD9CD',
};

export function Screen({
  children,
  artwork = false,
}: {
  children: ReactNode;
  artwork?: boolean;
}) {
  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={s.header}>
          <View style={s.brand}>
            <View style={s.logo}>
              <Text style={s.logoText}>m.</Text>
            </View>
            <Text style={s.brandText}>
              music room<Text style={{ color: colors.orange }}>®</Text>
            </Text>
          </View>
        </View>
        {artwork ? <RecordArt /> : <View style={s.divider} />}
        <View style={s.content}>{children}</View>
        <View style={s.footer}>
          <Text style={s.footerText}>MUSIC ROOM</Text>
          <Text style={s.footerSymbol}>✳︎</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RecordArt() {
  return (
    <View
      style={s.art}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={s.artTop}>
        <Text style={s.artCaption}>SIDE A</Text>
        <Text style={s.artCaption}>33⅓ RPM</Text>
      </View>
      <Text style={s.artWords}>Music{'\n'}Room.</Text>
      <View style={s.record}>
        {[206, 188, 170, 152, 134, 116].map((size) => (
          <View
            key={size}
            style={[
              s.groove,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          />
        ))}
        <View style={s.recordLabel}>
          <Text style={s.recordLabelText}>MUSIC{'\n'}ROOM</Text>
          <View style={s.recordHole} />
        </View>
      </View>
      <View style={s.artBottom}>
        <View style={s.dot} />
        <Text style={s.artCaption}>MUSIC ROOM / VOL. 01</Text>
      </View>
    </View>
  );
}

export function Heading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={s.heading}>
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      <Text style={s.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function Field({
  label,
  secureTextEntry,
  ...props
}: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, focused && s.focused]}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor="#98988D"
          selectionColor={colors.orange}
          secureTextEntry={secureTextEntry && !visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[s.input, props.style]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setVisible(!visible)}
            style={s.reveal}
          >
            <Text style={s.revealText}>{visible ? 'HIDE' : 'SHOW'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Action({
  title,
  onPress,
  disabled = false,
  secondary = false,
  destructive = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        destructive && s.destructive,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && s.secondaryText,
          destructive && { color: '#A7352C' },
        ]}
      >
        {title}
      </Text>
      {loading ? (
        <ActivityIndicator
          color={secondary ? colors.ink : colors.paper}
          size="small"
        />
      ) : (
        <Text
          style={[
            s.arrow,
            secondary && s.secondaryText,
            destructive && { color: '#A7352C' },
          ]}
        >
          {destructive ? '×' : '↗'}
        </Text>
      )}
    </Pressable>
  );
}

export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <Text
      accessibilityRole="alert"
      style={[
        s.notice,
        success && { color: '#3C6249', backgroundColor: '#E8EDE2' },
      ]}
    >
      {children}
    </Text>
  );
}

export function SwitchAction({
  prompt,
  title,
  accessibilityLabel,
  onPress,
}: {
  prompt: string;
  title: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={s.switch}>
      <Text style={s.subtitle}>{prompt}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        hitSlop={12}
      >
        <Text style={s.switchLink}>{title}</Text>
      </Pressable>
    </View>
  );
}

export const ui = StyleSheet.create({
  form: { gap: 16 },
  helper: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: -6 },
  card: {
    backgroundColor: '#EEEADF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 24,
    gap: 12,
    marginBottom: 24,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.paper, fontSize: 28, fontWeight: '600' },
  email: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  badge: {
    color: '#456147',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  section: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 14,
  },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: Platform.OS === 'ios' ? 70 : 44,
    paddingBottom: 30,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
    gap: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    backgroundColor: colors.ink,
    width: 33,
    height: 33,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.paper,
    fontSize: 25,
    fontWeight: '800',
    marginTop: -3,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.ink,
  },
  headerNote: {
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 1,
    color: colors.muted,
    textAlign: 'right',
  },
  divider: { height: 1, backgroundColor: colors.line, marginBottom: 36 },
  art: {
    height: 224,
    backgroundColor: '#E8B36E',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 30,
    padding: 18,
  },
  artTop: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 },
  artCaption: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.ink,
  },
  artWords: {
    fontSize: 37,
    lineHeight: 38,
    letterSpacing: -2,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 29,
    zIndex: 2,
  },
  record: {
    position: 'absolute',
    width: 226,
    height: 226,
    borderRadius: 113,
    backgroundColor: '#24251F',
    right: -65,
    top: 28,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-20deg' }],
  },
  groove: { position: 'absolute', borderWidth: 1, borderColor: '#42423A' },
  recordLabel: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recordLabelText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    color: colors.paper,
  },
  recordHole: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.paper,
  },
  artBottom: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 2,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.orange },
  content: { paddingBottom: 28 },
  eyebrow: {
    color: colors.orange,
    letterSpacing: 2,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 10,
  },
  heading: { gap: 8, marginBottom: 26 },
  title: {
    fontSize: 35,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1.5,
    color: colors.ink,
  },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  field: { gap: 8 },
  label: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '600',
    color: colors.ink,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEFCF7',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 54,
  },
  focused: { borderColor: colors.orange, backgroundColor: '#FFFFFF' },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  reveal: { padding: 14 },
  revealText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  button: {
    minHeight: 56,
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  arrow: { color: '#FFFFFF', fontSize: 23, lineHeight: 25 },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: { color: colors.ink },
  destructive: { backgroundColor: '#F1E5DD', borderWidth: 0 },
  notice: {
    color: '#A7352C',
    backgroundColor: '#F1E5DD',
    padding: 13,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  switch: {
    marginTop: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  switchLink: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: { fontSize: 8, letterSpacing: 1.7, color: colors.muted },
  footerSymbol: { fontSize: 24, color: colors.orange },
});
