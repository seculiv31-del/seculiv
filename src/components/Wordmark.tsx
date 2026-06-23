import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';

const LETTERS = ['S', 'E', 'C', 'U', 'L', 'I', 'V'];
const DOTTED_INDEXES = new Set([3, 5]); // points verts au-dessus du U et du I

type WordmarkProps = {
  size?: number;
};

export function Wordmark({ size = 30 }: WordmarkProps) {
  return (
    <View style={styles.row}>
      {LETTERS.map((letter, index) => (
        <View key={`${letter}-${index}`} style={styles.column}>
          <View style={[styles.dot, DOTTED_INDEXES.has(index) && styles.dotActive]} />
          <Text style={[styles.letter, { fontSize: size }]}>{letter}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  column: {
    alignItems: 'center',
    marginHorizontal: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  dotActive: {
    backgroundColor: colors.green,
  },
  letter: {
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 1,
  },
});
