import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type DateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: {
    text: string;
    textSecondary: string;
    background: string;
    backgroundSelected: string;
  };
};

export function DateInput({ label, value, onChange, theme }: DateInputProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const selectedDate = parseBirthDate(value) ?? new Date(2000, 0, 1);

  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={styles.label} themeColor="textSecondary">{label}</ThemedText>
      <Pressable
        accessibilityLabel="Seleccionar fecha de nacimiento"
        accessibilityRole="button"
        onPress={() => setIsPickerVisible(true)}
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
        <ThemedText style={[styles.value, { color: value ? theme.text : theme.textSecondary }]}>
          {value || 'Selecciona tu fecha de nacimiento'}
        </ThemedText>
        <ThemedText style={[styles.icon, { color: theme.textSecondary }]}>□</ThemedText>
      </Pressable>

      {isPickerVisible ? (
        <DateTimePicker
          accentColor={theme.text}
          maximumDate={new Date()}
          mode="date"
          negativeButton={{ label: 'Cancelar' }}
          onDismiss={() => setIsPickerVisible(false)}
          onValueChange={(_event, date) => {
            onChange(formatBirthDate(date));
            setIsPickerVisible(false);
          }}
          positiveButton={{ label: 'Aceptar' }}
          presentation="dialog"
          value={selectedDate}
        />
      ) : null}
    </View>
  );
}

function parseBirthDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBirthDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  fieldGroup: { gap: Spacing.one },
  label: { fontSize: 13, fontWeight: '700' },
  input: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  value: { fontSize: 16 },
  icon: { fontSize: 19 },
});
