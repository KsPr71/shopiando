import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { isSupabaseConfigured, supabase } from "@/services/supabase";

type AuthMode = "sign-in" | "sign-up";

export function LoginScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSignIn = mode === "sign-in";
  const canSubmit =
    email.trim().length > 0 && password.length >= 6 && !isSubmitting;

  async function submit() {
    if (!supabase)
      return setError(
        "Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_KEY en .env.",
      );
    if (!canSubmit)
      return setError(
        "Escribe un correo valido y una contrasena de al menos 6 caracteres.",
      );
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    const credentials = { email: email.trim(), password };
    const { error: authError } = isSignIn
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);
    setIsSubmitting(false);
    if (authError) return setError(authError.message);
    if (!isSignIn)
      setMessage(
        "Cuenta creada. Revisa tu correo si Supabase solicita confirmacion.",
      );
  }

  async function resetPassword() {
    if (!supabase)
      return setError("Configura Supabase antes de recuperar contrasenas.");
    if (!email.trim())
      return setError("Escribe tu correo para enviarte la recuperacion.");
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
    );
    setIsSubmitting(false);
    if (resetError) return setError(resetError.message);
    setMessage(
      "Te enviamos las instrucciones de recuperacion si el correo existe.",
    );
  }

  function switchMode() {
    setMode(isSignIn ? "sign-up" : "sign-in");
    setError(null);
    setMessage(null);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboard}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <Image
                source={require("@/../assets/images/icon.png")}
                style={styles.heroLogo}
              />
              <ThemedText style={styles.brand}>Shopiando</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.heroCopy}>
                Tus compras, mejor organizadas.
              </ThemedText>
            </View>
            <View style={styles.formBlock}>
              <ThemedText style={styles.title}>
                {isSignIn ? "Iniciar sesión" : "Crear cuenta"}
              </ThemedText>
              <View style={styles.fields}>
                <FloatingInput
                  label="CORREO"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tu@correo.com"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  theme={theme}
                />
                <FloatingInput
                  label="CONTRASEÑA"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 6 caracteres"
                  secureTextEntry={!showPassword}
                  autoComplete={isSignIn ? "current-password" : "new-password"}
                  textContentType={isSignIn ? "password" : "newPassword"}
                  theme={theme}
                  right={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                      onPress={() => setShowPassword(!showPassword)}
                      style={[
                        styles.eye,
                        { borderLeftColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText themeColor="info" style={styles.eyeText}>
                        {showPassword ? "Ocultar" : "Ver"}
                      </ThemedText>
                    </Pressable>
                  }
                />
              </View>
              {isSignIn && (
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={resetPassword}
                  style={styles.forgot}
                >
                  <ThemedText themeColor="info" style={styles.forgotText}>
                    ¿Olvidaste tu contraseña?
                  </ThemedText>
                </Pressable>
              )}
              {error && (
                <ThemedText style={[styles.error, { color: theme.primary }]}>
                  {error}
                </ThemedText>
              )}
              {message && (
                <ThemedText style={[styles.success, { color: theme.success }]}>
                  {message}
                </ThemedText>
              )}
              {!isSupabaseConfigured && (
                <ThemedText
                  type="small"
                  style={[styles.error, { color: theme.primary }]}
                >
                  Falta configurar Supabase en el archivo .env.
                </ThemedText>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={submit}
                style={({ pressed }) => [
                  styles.loginButton,
                  { backgroundColor: theme.primary },
                  !canSubmit && styles.disabled,
                  pressed && canSubmit && styles.pressed,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText type="smallBold" style={styles.loginText}>
                    {isSignIn ? "Iniciar sesión" : "Crear cuenta"}
                  </ThemedText>
                )}
              </Pressable>
            </View>
            <View style={styles.footer}>
              <ThemedText themeColor="textSecondary" style={styles.footerText}>
                {isSignIn ? "¿No tienes una cuenta?" : "¿Ya tienes una cuenta?"}
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={switchMode}>
                <ThemedText themeColor="info" style={styles.footerLink}>
                  {isSignIn ? " Regístrate" : " Inicia sesión"}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FloatingInput(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "email-address";
  autoComplete?: "email" | "current-password" | "new-password";
  textContentType?: "emailAddress" | "password" | "newPassword";
  theme: ReturnType<typeof useTheme>;
  right?: React.ReactNode;
}) {
  const { label, theme, right, ...inputProps } = props;
  return (
    <View style={[styles.field, { borderColor: theme.backgroundSelected }]}>
      <View
        style={[styles.fieldLabelWrap, { backgroundColor: theme.background }]}
      >
        <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>
          {label}
        </ThemedText>
      </View>
      <TextInput
        {...inputProps}
        autoCapitalize="none"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
      />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 33,
    paddingVertical: 28,
  },
  hero: { alignItems: "center", marginBottom: 30 },
  heroLogo: { width: 112, height: 112, borderRadius: 22, marginBottom: 12 },
  brand: { fontSize: 29, lineHeight: 35, fontWeight: "800" },
  heroCopy: { fontSize: 14, lineHeight: 21, marginTop: 2 },
  formBlock: { gap: 20 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: "700" },
  fields: { gap: 20 },
  field: {
    height: 54,
    borderWidth: 1,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
  },
  fieldLabelWrap: {
    position: "absolute",
    top: -8,
    left: 16,
    paddingHorizontal: 8,
    zIndex: 1,
  },
  fieldLabel: { fontSize: 12, lineHeight: 14, fontWeight: "500" },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    fontWeight: "400",
    paddingVertical: 0,
  },
  eye: {
    minWidth: 58,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  eyeText: { fontSize: 12, fontWeight: "700" },
  forgot: { alignSelf: "flex-end", marginTop: -10 },
  forgotText: { fontSize: 14, lineHeight: 21 },
  loginButton: {
    height: 54,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginText: { color: "#fff", fontSize: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.86 },
  error: { fontSize: 13, lineHeight: 19 },
  success: { fontSize: 13, lineHeight: 19 },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32,
  },
  footerText: { fontSize: 14, lineHeight: 21 },
  footerLink: { fontSize: 14, lineHeight: 21, fontWeight: "500" },
});
