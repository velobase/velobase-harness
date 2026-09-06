import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { HealthResponse } from "@velobase/contracts";
import { createMobileApi } from "./src/api";
import { mobileEnvironment } from "./src/env";
import { useTranslations } from "./src/i18n";

const api = createMobileApi(mobileEnvironment.apiOrigin);

export default function App() {
  const t = useTranslations();
  const [health, setHealth] = useState<HealthResponse>();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const refresh = async () => {
    setState("loading");
    try {
      setHealth(await api.getHealth());
      setState("ok");
    } catch {
      setState("error");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            {t("title")}
          </Text>
          <Text style={styles.text}>{t("description")}</Text>
          {state === "loading" && (
            <ActivityIndicator accessibilityLabel={t("loading")} />
          )}
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            {t(state)}
          </Text>
          {state === "ok" && health && (
            <Text style={styles.text}>{health.timestamp}</Text>
          )}
          <Button
            title={t("refresh")}
            onPress={() => {
              void refresh();
            }}
            disabled={state === "loading"}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", backgroundColor: "#f5f7fa" },
  card: {
    padding: 24,
    gap: 20,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  title: { fontSize: 30, fontWeight: "700", color: "#152033" },
  text: { fontSize: 16, color: "#26354c" },
});
