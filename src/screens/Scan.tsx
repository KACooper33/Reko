import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { recognizeText } from 'expo-ocr-kit';
import { ExpoRxnormDb } from '../db/expo';
import { findActivesSection } from '../parse/section';
import { extractActives } from '../parse/actives';
import { matchIngredient, prepareIndex, type PreparedIndex } from '../match/rxnorm';

/**
 * The demo screen. Scan a label, confirm what was found, see what else contains it.
 *
 * Deliberately not the harness. No trigram scores, no block coordinates, no
 * "unfiltered" caveats — those are development instruments and they undermine the
 * thing a person is being shown.
 *
 * The confirm step is not politeness. Half the matches measured on the C4 set are
 * flagged low-confidence because a real, different drug sits within 0.1 of the
 * right answer (deudextromethorphan against dextromethorphan). For an audience of
 * older adults, an app that asks rather than asserts is the feature.
 *
 * Type sizes are generous but this is not B5. Large type and TTS are a stage of
 * their own, and they have to be checked on the S8, whose 1440-wide screen no
 * emulator here reproduces.
 */

type Found = {
  /** What the label printed, verbatim. */
  printed: string;
  /** The base ingredient — the name a person recognises. */
  ingredient: string;
  strength: string;
  /** Other OTC products containing it. */
  brands: string[];
  /** False when a different real drug scored close. Drives the wording. */
  confident: boolean;
};

type Stage =
  | { name: 'intro' }
  | { name: 'camera' }
  | { name: 'working' }
  | { name: 'confirm'; found: Found[]; basis: string | null }
  | { name: 'result'; found: Found[]; basis: string | null }
  | { name: 'nothing' };

export function Scan({ onOpenHarness }: { onOpenHarness: () => void }) {
  const sqlite = useSQLiteContext();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [index, setIndex] = useState<PreparedIndex | null>(null);
  const [release, setRelease] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ name: 'intro' });

  useEffect(() => {
    (async () => {
      const db = new ExpoRxnormDb(sqlite);
      setRelease(await db.meta('rxnorm_release'));
      setAttribution(await db.meta('attribution'));
      setIndex(prepareIndex(await db.ingredients()));
    })();
  }, [sqlite]);

  async function capture() {
    const shot = await camera.current?.takePictureAsync();
    if (!shot?.uri || !index) return;
    setStage({ name: 'working' });

    try {
      // takePictureAsync gives a file URI, which is exactly what the OCR module
      // takes — so the whole chain proven against the C4 fixtures is reused here
      // unchanged, with a real photograph as the only difference.
      let ocr;
      try {
        ocr = await recognizeText(shot.uri);
      } catch {
        ocr = await recognizeText(shot.uri.replace(/^file:\/\//, ''));
      }

      const section = findActivesSection(ocr);
      const actives = section ? extractActives(section.lines) : [];
      if (!actives.length) {
        setStage({ name: 'nothing' });
        return;
      }

      const db = new ExpoRxnormDb(sqlite);
      const found: Found[] = [];
      const seen = new Set<number>();
      for (const active of actives) {
        const match = matchIngredient(active.name, index, 3);
        const top = match.candidates[0];
        if (!top) continue;
        const base = await db.baseIngredient(top.rxcui);
        const key = base?.rxcui ?? top.rxcui;
        // Dedupe on the resolved concept, not the extracted string. Two frames of a
        // curved bottle can read the same ingredient differently — one truncated —
        // and those must not become two ingredients.
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          printed: active.name,
          ingredient: base?.name ?? top.name,
          strength:
            active.strength !== null ? `${active.strength} ${active.unit ?? ''}`.trim() : '',
          brands: await db.brandsFor(top.rxcui),
          confident: match.confident,
        });
      }

      setStage(
        found.length
          ? { name: 'confirm', found, basis: section?.basis ?? null }
          : { name: 'nothing' },
      );
    } catch {
      setStage({ name: 'nothing' });
    }
  }

  const busy = !index;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Text style={s.wordmark}>Reko</Text>

      {stage.name === 'intro' && (
        <>
          <Text style={s.lede}>
            Point the camera at the Drug Facts panel on a medicine box or bottle. Reko
            reads the active ingredients and tells you what else contains them.
          </Text>
          <Pressable
            disabled={busy}
            onPress={async () => {
              if (!permission?.granted) {
                const res = await requestPermission();
                if (!res.granted) return;
              }
              setStage({ name: 'camera' });
            }}
            style={({ pressed }) => [s.cta, pressed && s.ctaPressed, busy && s.dim]}
          >
            <Text style={s.ctaIcon}>📷</Text>
            <Text style={s.ctaText}>{busy ? 'Getting ready…' : 'Scan a label'}</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'camera' && (
        <>
          <CameraView ref={camera} style={s.viewfinder} facing="back" />
          <Text style={s.hint}>
            Fill the frame with the panel. Hold steady — small print needs the focus.
          </Text>
          <Pressable onPress={capture} style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}>
            <Text style={s.ctaText}>Take the picture</Text>
          </Pressable>
          <Pressable onPress={() => setStage({ name: 'intro' })} style={s.quiet}>
            <Text style={s.quietText}>Cancel</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'working' && (
        <View style={s.panel}>
          <ActivityIndicator size="large" />
          <Text style={s.lede}>Reading the label…</Text>
        </View>
      )}

      {stage.name === 'confirm' && (
        <>
          <Text style={s.question}>
            {stage.found.length === 1
              ? 'Is this what the label says?'
              : 'Are these what the label says?'}
          </Text>
          {stage.found.map((f, i) => (
            <View key={i} style={s.card}>
              <Text style={s.ingredient}>{f.ingredient}</Text>
              <Text style={s.detail}>
                printed as “{f.printed}”{f.strength ? ` · ${f.strength}` : ''}
                {stage.basis ? ` ${stage.basis}` : ''}
              </Text>
              {!f.confident && (
                <Text style={s.unsure}>
                  We are not certain about this one. Please check it against the label.
                </Text>
              )}
            </View>
          ))}
          <Pressable
            onPress={() => setStage({ name: 'result', found: stage.found, basis: stage.basis })}
            style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}
          >
            <Text style={s.ctaText}>Yes, that's right</Text>
          </Pressable>
          <Pressable onPress={() => setStage({ name: 'camera' })} style={s.secondary}>
            <Text style={s.secondaryText}>No — take another picture</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'result' && (
        <>
          {stage.found.map((f, i) => (
            <View key={i} style={s.card}>
              <Text style={s.ingredient}>{f.ingredient}</Text>
              {f.strength ? <Text style={s.detail}>{f.strength} {stage.basis ?? ''}</Text> : null}
              {f.brands.length > 0 ? (
                <>
                  <Text style={s.alsoLabel}>Also found in</Text>
                  {f.brands.slice(0, 8).map((b) => (
                    <Text key={b} style={s.brand}>
                      {b}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={s.detail}>
                  We do not have a list of other products for this one.
                </Text>
              )}
            </View>
          ))}
          <Text style={s.caution}>
            Reko tells you what is in a medicine. It does not tell you whether to take it.
            Ask a pharmacist or doctor about that.
          </Text>
          <Pressable
            onPress={() => setStage({ name: 'intro' })}
            style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}
          >
            <Text style={s.ctaText}>Scan another</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'nothing' && (
        <>
          <Text style={s.question}>We could not read that label.</Text>
          <Text style={s.lede}>
            Small print and curved bottles are hard. Try filling more of the frame with
            the “Active ingredients” lines.
          </Text>
          <Pressable
            onPress={() => setStage({ name: 'camera' })}
            style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}
          >
            <Text style={s.ctaText}>Try again</Text>
          </Pressable>
        </>
      )}

      {/* NLM licence conditions: attribution is required verbatim, and a bundled
          copy must disclose that it is not the most current data. Not decoration. */}
      <View style={s.rule} />
      <Text style={s.legal}>
        Ingredient and brand data from the U.S. National Library of Medicine, RxNorm
        release {release ?? '…'}. This copy is not updated automatically and may not
        reflect the most current data from NLM. Brands shown are over-the-counter
        products only.
      </Text>
      <Text style={s.legal}>{attribution ?? ''}</Text>
      <Pressable
        onPress={onOpenHarness}
        accessibilityRole="button"
        hitSlop={12}
        style={({ pressed }) => [s.quiet, pressed && s.dim]}
      >
        <Text style={s.quietText}>Developer harness</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 56, gap: 16 },
  wordmark: { fontSize: 34, fontWeight: '700', textAlign: 'center' },
  lede: { fontSize: 18, lineHeight: 26 },
  question: { fontSize: 24, fontWeight: '600', marginTop: 8 },
  cta: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1b4ed8',
    paddingVertical: 22,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  ctaPressed: { backgroundColor: '#173fae' },
  ctaIcon: { fontSize: 34 },
  ctaText: { fontSize: 20, fontWeight: '600', color: '#fff' },
  dim: { opacity: 0.5 },
  secondary: {
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1b4ed8',
  },
  secondaryText: { fontSize: 18, fontWeight: '600', color: '#1b4ed8' },
  quiet: { alignItems: 'center', paddingVertical: 12 },
  quietText: { fontSize: 13, opacity: 0.45 },
  viewfinder: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden' },
  hint: { fontSize: 15, opacity: 0.7 },
  panel: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  card: {
    gap: 6,
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#f4f6fb',
  },
  ingredient: { fontSize: 26, fontWeight: '700' },
  detail: { fontSize: 16, opacity: 0.75 },
  unsure: { fontSize: 15, color: '#8a4b00', marginTop: 4, lineHeight: 21 },
  alsoLabel: { fontSize: 15, opacity: 0.6, marginTop: 10 },
  brand: { fontSize: 19, lineHeight: 27 },
  caution: { fontSize: 15, lineHeight: 22, opacity: 0.75 },
  rule: { height: 1, backgroundColor: '#e2e2e2', marginTop: 24 },
  legal: { fontSize: 11, lineHeight: 16, opacity: 0.6 },
});
