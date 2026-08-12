import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { recognizeText, type OcrResult } from 'expo-ocr-kit';
import { ExpoRxnormDb } from './src/db/expo';
import { Scan } from './src/screens/Scan';
import { findActivesSection } from './src/parse/section';
import { extractActives, type Active } from './src/parse/actives';
import { matchIngredient, prepareIndex, type PreparedIndex } from './src/match/rxnorm';

/**
 * B1 + B2a + B3a-c in one build.
 *
 * The wordmark and disabled camera control are B1's acceptance artefact and stay
 * until B1's S8 rows close. Below them is the development harness: run OCR on a
 * bundled C4 frame, parse it, match against the bundled RxNorm database, and
 * export the raw OCR so the laptop scoring harness has frozen input.
 *
 * The attribution line and the "data as of" date are NOT optional decoration.
 * NLM's RxNorm terms require attribution, and require a redistributor either to
 * keep data current or disclose that it is not. Both strings come from the
 * database's meta table so they cannot drift from the data they describe.
 */

const FRAMES = [
  {
    key: 'topcare',
    label: 'TopCare (control — flat panel)',
    file: 'topcare_daytime_coldandflu_ingredients',
    module: require('./assets/test-labels/topcare_daytime_coldandflu_ingredients.jpg'),
  },
  {
    key: 'mucinex1',
    label: 'Mucinex frame 1 (curved bottle, full names)',
    file: 'mucinex_cough_1',
    module: require('./assets/test-labels/mucinex_cough_1.jpg'),
  },
  {
    // The wrapped continuation. Strengths survive; the names are cut off at the
    // label edge ("omethorphan HBr 5 mg"). Neither frame alone is complete, which
    // is what makes this the first real test of B2c's merge.
    key: 'mucinex2',
    label: 'Mucinex frame 2 (wrapped, names truncated)',
    file: 'mucinex_cough_2',
    module: require('./assets/test-labels/mucinex_cough_2.jpg'),
  },
  {
    key: 'nyquil',
    label: 'NyQuil (inverted, translucent)',
    file: 'nyquil_kids_cold_and_cough_withbarcode',
    module: require('./assets/test-labels/nyquil_kids_cold_and_cough_withbarcode.jpg'),
  },
  {
    // Measured worst of the four, which was not the guess. Small print on a
    // narrow cylinder corrupts both the heading and the drug name, while
    // NyQuil's inverted white-on-blue reads cleanly. See docs/b2a-ocr-findings.md
    key: 'mylicon',
    label: 'Mylicon (hardest — small print, narrow cylinder)',
    file: 'infants_mylicon',
    module: require('./assets/test-labels/infants_mylicon.jpg'),
  },
] as const;

type Row = {
  active: Active;
  match: ReturnType<typeof matchIngredient>;
  /** The base ingredient behind the match — the name worth showing a person. */
  base: string | null;
  /** B4's payoff: other products carrying the same ingredient. */
  brands: string[];
};

type RunState = {
  frameKey: string;
  status: 'running' | 'ok' | 'error';
  ocrMs?: number;
  matchMs?: number;
  via?: string;
  basis?: string | null;
  rows?: Row[];
  raw?: OcrResult;
  exported?: string;
  error?: string;
};

export default function App() {
  return (
    <SQLiteProvider
      databaseName="rxnorm.sqlite"
      assetSource={{ assetId: require('./assets/rxnorm.sqlite') }}
    >
      <Router />
    </SQLiteProvider>
  );
}

/**
 * Routing state lives BELOW SQLiteProvider, deliberately.
 *
 * Measured: with the conditional inline as SQLiteProvider's children, a state
 * change in the parent never reached the screen. The provider does not re-render
 * children when its parent re-renders, so the branch was frozen at mount — the
 * onPress fired, the setter ran, and nothing happened. Cold starts behaved the
 * same, so it was not a Fast Refresh artefact.
 *
 * Keeping the state here means the provider's children element is stable and this
 * component re-renders normally.
 */
function Router() {
  // The demo is the default. The harness stays reachable, because it is the only
  // regression suite that exists and it produces the frozen OCR fixtures.
  const [showHarness, setShowHarness] = useState(false);
  return showHarness ? (
    <Harness onBack={() => setShowHarness(false)} />
  ) : (
    <Scan onOpenHarness={() => setShowHarness(true)} />
  );
}

function Harness({ onBack }: { onBack: () => void }) {
  const sqlite = useSQLiteContext();
  const [index, setIndex] = useState<PreparedIndex | null>(null);
  const [indexMs, setIndexMs] = useState(0);
  const [release, setRelease] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);

  useEffect(() => {
    (async () => {
      const db = new ExpoRxnormDb(sqlite);
      setRelease(await db.meta('rxnorm_release'));
      setAttribution(await db.meta('attribution'));
      const t0 = Date.now();
      const rows = await db.ingredients();
      const prepared = prepareIndex(rows);
      setIndexMs(Date.now() - t0);
      setIndex(prepared);
    })();
  }, [sqlite]);

  async function runFrame(frame: (typeof FRAMES)[number]) {
    setRun({ frameKey: frame.key, status: 'running' });
    try {
      const asset = Asset.fromModule(frame.module);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;

      const t0 = Date.now();
      let raw: OcrResult;
      try {
        raw = await recognizeText(uri);
      } catch {
        raw = await recognizeText(uri.replace(/^file:\/\//, ''));
      }
      const ocrMs = Date.now() - t0;

      // Freeze the OCR for the laptop harness. Written to the app's document
      // directory; pull it with:
      //   adb exec-out run-as com.kacooper.reko cat files/<name>.ocr.json
      const name = `${frame.file}.ocr.json`;
      let exported: string | undefined;
      try {
        const out = new File(Paths.document, name);
        out.write(JSON.stringify(raw, null, 2));
        exported = name;
      } catch (e) {
        exported = `export failed: ${e instanceof Error ? e.message : String(e)}`;
      }

      const section = findActivesSection(raw);
      const actives = section ? extractActives(section.lines) : [];

      const t1 = Date.now();
      const matched = index
        ? actives.map((active) => ({ active, match: matchIngredient(active.name, index, 3) }))
        : [];
      const matchMs = Date.now() - t1;

      // B4 — the brand bridge. Only for the top candidate, and only when there
      // is one: bridging from a guess would compound a wrong match into a wrong
      // list of products.
      const db = new ExpoRxnormDb(sqlite);
      const rows: Row[] = [];
      for (const m of matched) {
        const top = m.match.candidates[0];
        if (!top) {
          rows.push({ ...m, base: null, brands: [] });
          continue;
        }
        const base = await db.baseIngredient(top.rxcui);
        const brands = await db.brandsFor(top.rxcui);
        rows.push({ ...m, base: base?.name ?? null, brands });
      }

      setRun({
        frameKey: frame.key,
        status: 'ok',
        ocrMs,
        matchMs,
        via: section?.via ?? 'none',
        basis: section?.basis ?? null,
        rows,
        raw,
        exported,
      });
    } catch (e) {
      setRun({
        frameKey: frame.key,
        status: 'error',
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Text style={styles.backText}>← back to Reko</Text>
      </Pressable>
      <Text style={styles.sectionTitle}>B3 harness — OCR, parse, match</Text>
      <Text style={styles.hint}>
        {index
          ? `${index.length.toLocaleString()} IN/PIN concepts indexed in ${indexMs} ms`
          : 'loading the RxNorm index…'}
      </Text>

      {FRAMES.map((frame) => (
        <Pressable
          key={frame.key}
          onPress={() => runFrame(frame)}
          disabled={!index}
          style={({ pressed }) => [
            styles.frameButton,
            pressed && styles.framePressed,
            !index && styles.frameDisabled,
          ]}
        >
          <Text style={styles.frameLabel}>{frame.label}</Text>
        </Pressable>
      ))}

      {run?.status === 'running' && (
        <View style={styles.panel}>
          <ActivityIndicator />
          <Text style={styles.meta}>Working…</Text>
        </View>
      )}

      {run?.status === 'error' && (
        <View style={[styles.panel, styles.panelError]}>
          <Text style={styles.metaStrong}>FAILED</Text>
          <Text style={styles.mono}>{run.error}</Text>
        </View>
      )}

      {run?.status === 'ok' && (
        <View style={styles.panel}>
          <Text style={styles.metaStrong}>
            OCR {run.ocrMs} ms · match {run.matchMs} ms · section via {run.via}
          </Text>
          <Text style={styles.meta}>basis: {run.basis ?? '(none found)'}</Text>
          <Text style={styles.meta}>exported: {run.exported}</Text>

          <Text style={styles.metaStrong}>ACTIVES FOUND</Text>
          {run.rows?.length ? (
            run.rows.map(({ active, match, base, brands }, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.mono}>
                  {active.name} — {active.strength ?? '?'} {active.unit ?? ''}
                </Text>
                {match.candidates.slice(0, 2).map((c, j) => (
                  <Text key={j} style={styles.monoDim}>
                    {j === 0 ? '→' : '  '} {c.score.toFixed(2)} {c.tty} {c.name}
                    {j === 0 && !match.confident ? '   (not confident)' : ''}
                  </Text>
                ))}
                {base && <Text style={styles.base}>{base}</Text>}
                {brands.length > 0 && (
                  <>
                    <Text style={styles.brands}>
                      also in: {brands.slice(0, 6).join(' · ')}
                    </Text>
                    {/* The count is shown deliberately. A6 exists because RxNorm
                        returns everything, including registry artefacts like
                        "Calagel Reformulated Jun 2019". Hiding the number would
                        hide the problem the allowlist is meant to solve. */}
                    <Text style={styles.brandsMeta}>
                      {brands.length} brands, unfiltered — A6 allowlist not yet applied
                    </Text>
                  </>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.mono}>none</Text>
          )}
        </View>
      )}

      {/* ---- NLM licence obligations. Not decoration. ---- */}
      <View style={styles.rule} />
      <Text style={styles.metaStrong}>Source</Text>
      <Text style={styles.legal}>
        RxNorm data as of {release ?? '…'}. This bundled copy is not updated automatically
        and may not reflect the most current data from NLM.
      </Text>
      <Text style={styles.legal}>{attribution ?? ''}</Text>

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
  frameDisabled: { opacity: 0.4 },
  frameLabel: { fontSize: 15 },
  panel: { gap: 8, padding: 12, backgroundColor: '#f6f6f6', borderRadius: 8 },
  panelError: { backgroundColor: '#fdecea' },
  row: { marginBottom: 8 },
  meta: { fontSize: 12, opacity: 0.7 },
  metaStrong: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15 },
  monoDim: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15, opacity: 0.6 },
  backLink: { paddingVertical: 8 },
  backText: { fontSize: 15, color: '#1b4ed8' },
  base: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  brands: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  brandsMeta: { fontSize: 10, opacity: 0.5, marginTop: 1 },
  legal: { fontSize: 11, opacity: 0.7, lineHeight: 15 },
});
