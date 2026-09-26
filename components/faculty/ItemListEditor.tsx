import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  input,
  layout,
  spacing,
  typography,
} from '@/constants/theme';

import type { ListItem } from '../../services/experimentAuthoring';

export type { ListItem };

export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  numeric?: boolean;
};

export type ItemSummary = {
  title: string;
  /** Right-aligned value on the title line, e.g. "1000 kg/m³". */
  meta?: string;
  lines?: string[];
  monoLines?: boolean;
};

export type ItemListEditorProps = {
  items: ListItem[];
  onChange: (items: ListItem[]) => void;
  fields: FieldDef[];
  addLabel: string;
  emptyText: string;
  summarize: (item: ListItem) => ItemSummary;
};

let nextItemId = 0;
const createItemId = () => `new-${nextItemId++}`;

export function ItemListEditor({
  items,
  onChange,
  fields,
  addLabel,
  emptyText,
  summarize,
}: ItemListEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateField(id: string, key: string, value: string) {
    onChange(
      items.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  }

  function remove(id: string) {
    onChange(items.filter((item) => item.id !== id));

    if (editingId === id) {
      setEditingId(null);
    }
  }

  function add() {
    const blank: ListItem = { id: createItemId() };

    fields.forEach((field) => {
      blank[field.key] = '';
    });

    onChange([...items, blank]);
    setEditingId(blank.id);
  }

  return (
    <Card style={styles.card}>
      {items.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        items.map((item, index) => {
          const editing = item.id === editingId;
          const summary = summarize(item);

          return (
            <View key={item.id} style={index > 0 && styles.divider}>
              {editing ? (
                <View style={styles.editor}>
                  {fields.map((field) => (
                    <TextField
                      key={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      value={item[field.key] ?? ''}
                      onChangeText={(text) =>
                        updateField(item.id, field.key, text)
                      }
                      keyboardType={field.numeric ? 'numeric' : 'default'}
                    />
                  ))}

                  <View style={styles.editorActions}>
                    <PrimaryButton
                      title="Done"
                      size="sm"
                      icon="checkmark"
                      fullWidth={false}
                      onPress={() => setEditingId(null)}
                    />

                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      accessibilityLabel={`Remove ${summary.title || 'item'}`}
                      onPress={() => remove(item.id)}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.summaryRow}>
                  <View style={styles.summaryText}>
                    <View style={styles.titleLine}>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {summary.title || 'Untitled'}
                      </Text>

                      {summary.meta ? (
                        <Text style={styles.itemMeta}>{summary.meta}</Text>
                      ) : null}
                    </View>

                    {summary.lines?.map((line, lineIndex) => (
                      <Text
                        key={`${line}-${lineIndex}`}
                        style={summary.monoLines ? styles.monoLine : styles.line}
                      >
                        {line}
                      </Text>
                    ))}
                  </View>

                  <IconButton
                    icon="create-outline"
                    accessibilityLabel={`Edit ${summary.title || 'item'}`}
                    onPress={() => setEditingId(item.id)}
                  />

                  <IconButton
                    icon="trash-outline"
                    tone="danger"
                    accessibilityLabel={`Remove ${summary.title || 'item'}`}
                    onPress={() => remove(item.id)}
                  />
                </View>
              )}
            </View>
          );
        })
      )}

      <View style={items.length > 0 && styles.addSpacing}>
        <SecondaryButton
          title={addLabel}
          size="sm"
          icon="add"
          fullWidth={false}
          onPress={add}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  empty: {
    ...typography.body,
    color: colors.text.secondary,
  },
  divider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
    paddingTop: spacing.md,
  },
  addSpacing: {
    marginTop: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  summaryText: {
    flex: 1,
    gap: spacing.xs,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  itemTitle: {
    ...typography.label,
    color: colors.text.primary,
    flexShrink: 1,
  },
  itemMeta: {
    ...typography.mono,
    color: colors.text.secondary,
  },
  line: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  monoLine: {
    ...typography.mono,
    color: colors.text.secondary,
  },
  editor: {
    gap: input.fieldGap,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
