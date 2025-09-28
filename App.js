import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";

// Public random fact API (JSON: { text: string })
const API_URL = "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en";

// Backoff / retry tuning
const MAX_RETRIES = 3;         // total attempts = 1 + retries
const BASE_DELAY_MS = 400;     // initial backoff delay
const JITTER = 0.25;           // +/-25% jitter to avoid thundering herd

// Local fallback facts if the network fails entirely
const FALLBACK = [
  "Honey never spoils.",
  "Octopuses have three hearts.",
  "Sharks existed before trees.",
  "Wombat poop is cube-shaped.",
  "Bananas are berries; strawberries aren’t.",
];

// Small in-memory cache settings
const CACHE_TARGET_SIZE = 4;   // try to keep this many facts queued

// --- tiny helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch with exponential backoff + jitter.
 * Example delays (BASE=400ms): ~400ms, ~800ms, ~1600ms (with jitter).
 */
async function fetchWithRetry(url, toText) {
  let attempt = 0;
  // Capture last error for context
  let lastErr;
  while (attempt <= MAX_RETRIES) {
    try {
      const data = await fetchJson(url);
      const text = toText(data);
      if (!text || typeof text !== "string") throw new Error("Invalid response");
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_RETRIES) break;
      const base = BASE_DELAY_MS * Math.pow(2, attempt); // exponential
      const jitter = base * (Math.random() * 2 * JITTER - JITTER); // +/- JITTER
      const delay = Math.max(100, base + jitter);
      await sleep(delay);
      attempt += 1;
    }
  }
  // Give up: return null; caller decides how to handle fallback
  console.warn("fetchWithRetry: giving up after retries:", lastErr?.message);
  return null;
}

export default function App() {
  const [fact, setFact] = useState("Loading fun fact…");
  const [busy, setBusy] = useState(false);

  // In-memory cache & de-duplication set
  const cacheRef = useRef([]);        // queue of upcoming facts
  const seenRef = useRef(new Set());  // avoid immediate repeats this session

  // Extract text from API’s JSON
  const toText = (data) => data?.text;

  // Prime the cache up to CACHE_TARGET_SIZE (non-blocking)
  const primeCache = useCallback(async () => {
    try {
      while (cacheRef.current.length < CACHE_TARGET_SIZE) {
        const text = await fetchWithRetry(API_URL, toText);
        if (!text) break; // stop trying if API is failing hard
        // avoid adding duplicates we’ve shown this session
        if (!seenRef.current.has(text)) {
          cacheRef.current.push(text);
          seenRef.current.add(text);
        }
      }
    } catch {
      // swallow; we'll rely on fallback if needed
    }
  }, []);

  // Show next fact from cache; if empty, try to fetch one; otherwise fallback
  const getNextFact = useCallback(async () => {
    setBusy(true);
    try {
      let next = cacheRef.current.shift();
      if (!next) {
        // Cache empty—fetch one directly (still with retries)
        next = await fetchWithRetry(API_URL, toText);
      }
      if (!next) {
        // Still nothing—use local fallback
        next = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
      }
      setFact(next);
      // Refill cache in the background for future taps
      primeCache();
    } finally {
      setBusy(false);
    }
  }, [primeCache]);

  // Initial load
  useEffect(() => {
    // First show: try cache (will be empty), so fetch one, then backfill cache
    getNextFact();
  }, [getNextFact]);

  const handlePress = () => {
    if (!busy) getNextFact();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <Pressable
        onPress={handlePress}
        style={styles.container}
        android_ripple={{ color: "#eee" }}
        accessibilityRole="button"
        accessibilityLabel="Fun fact"
        accessibilityHint="Double tap to load another fact"
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
          {busy ? "Fetching…" : "Tap anywhere for another fact"}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fact: {
    color: "#000000",
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "system-ui",
    }),
  },
  hint: {
    marginTop: 12,
    color: "#000000",
    opacity: 0.5,
    fontSize: 14,
  },
});
