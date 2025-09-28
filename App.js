import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_URL = "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en";
const FALLBACK = [
  "honey never spoils.",
  "octopuses have three hearts.",
  "sharks existed before trees.",
  "wombat poop is cube-shaped.",
  "bananas are berries; strawberries aren’t.",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}
async function fetchWithRetry(url, toText) {
  let attempt = 0;
  let delay = 400;
  while (attempt < 3) {
    try {
      const d = await fetchJson(url);
      const t = toText(d);
      if (!t) throw new Error("bad data");
      return t.toLowerCase();
    } catch {
      await sleep(delay);
      delay *= 2;
      attempt++;
    }
  }
  return null;
}

export default function App() {
  const [fact, setFact] = useState("loading fun fact…");
  const [busy, setBusy] = useState(false);
  const cacheRef = useRef([]);
  const seenRef = useRef(new Set());

  const primeCache = useCallback(async () => {
    while (cacheRef.current.length < 4) {
      const f = await fetchWithRetry(API_URL, (d) => d?.text);
      if (!f) break;
      if (!seenRef.current.has(f)) {
        cacheRef.current.push(f);
        seenRef.current.add(f);
      }
    }
  }, []);

  const nextFact = useCallback(async () => {
    setBusy(true);
    try {
      let f = cacheRef.current.shift();
      if (!f) f = await fetchWithRetry(API_URL, (d) => d?.text);
      if (!f)
        f = FALLBACK[Math.floor(Math.random() * FALLBACK.length)].toLowerCase();
      setFact(f);
      primeCache();
    } finally {
      setBusy(false);
    }
  }, [primeCache]);

  useEffect(() => {
    nextFact();
  }, [nextFact]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Pressable
          onPress={() => !busy && nextFact()}
          style={styles.pressArea}
          android_ripple={{ color: "#e6d9c5" }}
        >
          <Text
            style={styles.fact}
            numberOfLines={8}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {fact}
          </Text>
          <Text style={styles.hint}>
            {busy ? "fetching…" : "tap anywhere for another fact"}
          </Text>
        </Pressable>

        {/* footer text in the bottom-left corner */}
        <Text style={styles.footer}>scottscookies made this app btw</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f5e7d0",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  pressArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  fact: {
    color: "#000",
    fontSize: 28,
    lineHeight: 34,
    textAlign: "left",
    textTransform: "lowercase",
  },
  hint: {
    marginTop: 12,
    color: "#000",
    opacity: 0.5,
    fontSize: 14,
    textAlign: "left",
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 16,
    fontSize: 12,
    color: "#000",
    opacity: 0.5,
    textTransform: "lowercase",
  },
});
