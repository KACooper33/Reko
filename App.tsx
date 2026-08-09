import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * B1 screen. Deliberately does nothing.
 *
 * The camera control is present and visibly disabled. B1 proves the
 * distribution chain — EAS internal distribution, the install link, Play
 * Protect's warnings — before any feature exists. A working camera here
 * would make a build failure ambiguous between the pipeline and the
 * dependency, which is the one thing B1 is trying to isolate.
 *
 * Type sizes are a first pass, not the large-type work. That is B5, and it
 * has to be checked on the S8 itself — the API 28 emulator stands in at 1080
 * wide against the S8's 1440, so it cannot answer type-size questions.
 */
export default function App() {
  return (
    <View style={styles.container}>
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

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    backgroundColor: '#fff',
    padding: 24,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '600',
  },
  scanButton: {
    alignItems: 'center',
    gap: 12,
    opacity: 0.35,
    paddingVertical: 28,
    paddingHorizontal: 40,
    borderWidth: 2,
    borderRadius: 16,
  },
  scanIcon: {
    fontSize: 44,
  },
  scanLabel: {
    fontSize: 22,
  },
  status: {
    fontSize: 17,
    opacity: 0.6,
  },
});
