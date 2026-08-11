import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { recognizeText, type OcrResult } from 'expo-ocr-kit';

/**
 * B1 + B2a in one build.
 *
 * The wordmark and the disabled camera control are B1's acceptance artefact —
 * they stay until B1's S8 rows close, so one build serves both.
 *
 * Below that is B2a: run OCR on a bundled still image and dump the raw text.
 * No camera. The whole point is to learn whether expo-ocr-kit 0.1.4 works on
 * SDK 57 before any capture UI exists, and to see what B3a will be parsing.
 */

// Frames come from the C4 golden set. Order is easiest first: if the control
// case fails, the problem is the module, not the photograph.
const FRAMES = [
  {
    key: 'topcare',
    label: 'TopCare (control — flat panel)',
    module: require('./assets/test-labels/topcare_daytime_coldandflu_ingredients.jpg'),
    expected: 'Acetaminophen 325 / Dextromethorphan HBr 10 / Phenylephrine HCl 5',
  },
  {
    key: 'mucinex',
    label: 'Mucinex (curved bottle)',
    module: require('./assets/test-labels/mucinex_cough.jpg'),
    expected: 'Dextromethorphan HBr 5 / Guaifenesin 100',
  },
  {
    key: 'nyquil',
    label: 'NyQuil (inverted, translucent)',
    module: require('./assets/test-labels/nyquil_kids_cold_and_cough_withbarcode.jpg'),
    expected: 'Chlorpheniramine maleate 2 / Dextromethorphan HBr 15',
  },
  {
    // Measured worst of the four, which was not the guess. Small print on a
    // narrow cylinder corrupts both the heading and the drug name, while
    // NyQuil's inverted white-on-blue reads cleanly. Print size and curvature
    // predict failure; contrast polarity does not. See docs/b2a-ocr-findings.md
    key: 'mylicon',
    label: 'Mylicon (hardest — small print, narrow cylinder)',
    module: require('./assets/test-labels/infants_mylicon.jpg'),
    expected: 'Simethicone 20',
  },
] as const;

type RunState = {
  frameKey: string;
  status: 'running' | 'ok' | 'error';
  uriUsed?: string;
  strippedScheme?: boolean;
  ms?: number;
  result?: OcrResult;
  error?: string;
};

export default function App() {
  const [run, setRun] = useState<RunState | null>(null);

  async function runOcr(frame: (typeof FRAMES)[number]) {
    setRun({ frameKey: frame.key, status: 'running' });
    const started = Date.now();
    try {
      // A bundler reference is not a file path. The native module needs a real
      // file on disk, which is what downloadAsync + localUri produces.
      const asset = Asset.fromModule(frame.module);
      await asset.downloadAsync();
      const localUri = asset.localUri ?? asset.uri;

      // Some native modules reject the file:// scheme. Try as-is, then bare.
      let result: OcrResult;
      let strippedScheme = false;
      try {
        result = await recognizeText(localUri);
      } catch (first) {
        strippedScheme = true;
        result = await recognizeText(localUri.replace(/^file:\/\//, ''));
      }

      setRun({
        frameKey: frame.key,
        status: 'ok',
        uriUsed: localUri,
        strippedScheme,
        ms: Date.now() - started,
        result,
      });
    } catch (e) {
      setRun({
        frameKey: frame.key,
        status: 'error',
        ms: Date.now() - started,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }

  const active = FRAMES.find((f) => f.key === run?.frameKey);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {/* ---- B1 artefact: keep until the S8 rows close ---- */}
      <Text style={styles.wordmark}>Reko</Text>
      <Pressable
        disabled
        accessibilityRole="button"
        accessibilityLabel="Scan a label"
        accessibilityHint="Not available yet"
        accessibilityState={{ disabled: true }}
        style={styles.scanButton}
      >
        <Text style={styles.scanIcon}>📷</Text>
        <Text style={styles.scanLabel}>Scan a label</Text>
      </Pressable>
      <Text style={styles.status}>Not available yet</Text>

      {/* ---- B2a harness ---- */}
      <View style={styles.rule} />
      <Text style={styles.sectionTitle}>B2a — OCR on a still image</Text>
      <Text style={styles.hint}>No camera. Reads a bundled C4 frame.</Text>

      {FRAMES.map((frame) => (
        <Pressable
          key={frame.key}
          onPress={() => runOcr(frame)}
          style={({ pressed }) => [styles.frameButton, pressed && styles.framePressed]}
        >
          <Text style={styles.frameLabel}>{frame.label}</Text>
        </Pressable>
      ))}

      {run?.status === 'running' && (
        <View style={styles.panel}>
          <ActivityIndicator />
          <Text style={styles.meta}>Recognising…</Text>
        </View>
      )}

      {run?.status === 'error' && (
        <View style={[styles.panel, styles.panelError]}>
          <Text style={styles.metaStrong}>FAILED after {run.ms} ms</Text>
          <Text style={styles.mono}>{run.error}</Text>
        </View>
      )}

      {run?.status === 'ok' && run.result && (
        <View style={styles.panel}>
          <Text style={styles.metaStrong}>
            {run.result.text.length} chars · {run.result.blocks.length} blocks · {run.ms} ms
          </Text>
          <Text style={styles.meta}>
            uri: {run.strippedScheme ? 'file:// stripped' : 'used as-is'}
          </Text>
          {active && <Text style={styles.meta}>expected: {active.expected}</Text>}

          <Text style={styles.metaStrong}>RAW TEXT</Text>
          <Text style={styles.mono} selectable>
            {run.result.text || '(empty)'}
          </Text>

          <Text style={styles.metaStrong}>BLOCKS</Text>
          {run.result.blocks.map((b, i) => (
            <Text key={i} style={styles.mono} selectable>
              [{i}] y={Math.round(b.boundingBox.y)} x={Math.round(b.boundingBox.x)}{' '}
              {JSON.stringify(b.text)}
            </Text>
          ))}
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  pageContent: { padding: 20, paddingTop: 56, gap: 12 },
  wordmark: { fontSize: 40, fontWeight: '600', textAlign: 'center' },
  scanButton: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
    opacity: 0.35,
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderWidth: 2,
    borderRadius: 16,
  },
  scanIcon: { fontSize: 36 },
  scanLabel: { fontSize: 20 },
  status: { fontSize: 15, opacity: 0.6, textAlign: 'center' },
  rule: { height: 1, backgroundColor: '#ddd', marginVertical: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  hint: { fontSize: 13, opacity: 0.6 },
  frameButton: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  framePressed: { backgroundColor: '#eee' },
  frameLabel: { fontSize: 15 },
  panel: { gap: 8, padding: 12, backgroundColor: '#f6f6f6', borderRadius: 8 },
  panelError: { backgroundColor: '#fdecea' },
  meta: { fontSize: 12, opacity: 0.7 },
  metaStrong: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15 },
});
