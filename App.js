import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// --- API + helpers (unchanged essentials) ---
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

// --- rate limit settings ---
const MAX_PER_MINUTE = 5;
const WINDOW_MS = 60_000;

export default function App() {
  const [fact, setFact] = useState("loading fun fact…");
  const [busy, setBusy] = useState(false);

  // cache for snappy taps (doesn't count against limit by itself)
  const cacheRef = useRef([]);
  const seenRef = useRef(new Set());

  // rate-limit tracking
  const tapsRef = useRef([]); // array<number> of timestamps for user-triggered fetches
  const [limitUntil, setLimitUntil] = useState(null); // number | null (epoch ms)
  const [remaining, setRemaining] = useState(0); // seconds shown on the popup
  const [showLimit, setShowLimit] = useState(false);

  // countdown timer for the popup
  useEffect(() => {
    let id;
    if (limitUntil) {
      id = setInterval(() => {
        const msLeft = Math.max(0, limitUntil - Date.now());
        const secs = Math.ceil(msLeft / 1000);
        setRemaining(secs);
        if (msLeft <= 0) {
          setLimitUntil(null);
          setShowLimit(false);
        }
      }, 250);
    } else {
      setRemaining(0);
    }
    return () => id && clearInterval(id);
  }, [limitUntil]);

  // prime cache (called after showing a fact; doesn’t count toward rate limit)
  const primeCache = useCallback(async () => {
    try {
      while (cacheRef.current.length < 4) {
        const f = await fetchWithRetry(API_URL, (d) => d?.text);
        if (!f) break;
        if (!seenRef.current.has(f)) {
          cacheRef.current.push(f);
          seenRef.current.add(f);
        }
      }
    } catch {
      /* noop */
    }
  }, []);

  // rate-limit check for user taps
  const canTap = useCallback(() => {
    const now = Date.now();
    // purge old timestamps
    tapsRef.current = tapsRef.current.filter((t) => now - t < WINDOW_MS);

    if (tapsRef.current.length >= MAX_PER_MINUTE) {
      const oldest = Math.min(...tapsRef.current);
      const nextAt = oldest + WINDOW_MS;
      setLimitUntil(nextAt);
      setShowLimit(true);
      return false;
    }
    // record this tap (we count only user-triggered attempts)
    tapsRef.current.push(now);
    return true;
  }, []);

  const getNextFact = useCallback(async () => {
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

  // initial load (does not count against the limit)
  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        let f = await fetchWithRetry(API_URL, (d) => d?.text);
        if (!f)
          f =
            FALLBACK[Math.floor(Math.random() * FALLBACK.length)].toLowerCase();
        setFact(f);
        primeCache();
      } finally {
        setBusy(false);
      }
    })();
  }, [primeCache]);

  const handlePress = () => {
    if (busy) return;
    if (limitUntil && Date.now() < limitUntil) {
      setShowLimit(true);
      return;
    }
    if (!canTap()) return;
    getNextFact();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Pressable
          onPress={handlePress}
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

        {/* credit footer */}
        <Text style={styles.footer}>scottscookies made this app</Text>

        {/* simple rate-limit popup */}
        {showLimit && (
          <View style={styles.popupWrap} pointerEvents="box-none">
            <View style={styles.popup}>
              <Text style={styles.popupTitle}>OOPS 😢</Text>
              <Text style={styles.popupMsg}>
                i added this so people dont spam the api LMFAO. please take a break and slow down. 
              </Text>
              <Text style={styles.popupTimer}>
                try again in {Math.max(0, remaining)}s
              </Text>
              <Pressable
                onPress={() => setShowLimit(false)}
                style={styles.popupBtn}
              >
                <Text style={styles.popupBtnText}>ok</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f5e7d0", // light tan
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  pressArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start", // left align
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
  // popup styles
  popupWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  popup: {
    width: "86%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e6d9c5",
  },
  popupTitle: {
    textAlign: "left",
    fontSize: 18,
    fontWeight: "600",
    textTransform: "lowercase",
    color: "#000",
    marginBottom: 6,
  },
  popupMsg: {
    textAlign: "left",
    color: "#000",
    opacity: 0.8,
    marginBottom: 8,
    textTransform: "lowercase",
  },
  popupTimer: {
    textAlign: "left",
    fontSize: 14,
    color: "#000",
    opacity: 0.7,
    marginBottom: 12,
    textTransform: "lowercase",
  },
  popupBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#f5e7d0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e6d9c5",
  },
  popupBtnText: {
    color: "#000",
    textTransform: "lowercase",
  },
});
