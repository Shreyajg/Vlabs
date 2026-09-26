import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExperimentCard } from '@/components/faculty/ExperimentCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  iconSizes,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';

import { subjectNameFromId } from '../../../services/experimentDetail';
import { getAllExperiments, setExperimentPublished } from '../../../services/experimentService';
import { experimentRefKey } from '../../../services/reportService';
import { getSubjects } from '../../../services/subjectService';
import type { NormalizedExperiment } from '../../../types/Experiment';

type Filter = 'all' | 'published' | 'draft';
type Status = 'loading' | 'ready' | 'error';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
];

export default function FacultyExperiments() {
  const [status, setStatus] = useState<Status>('loading');
  const [experiments, setExperiments] = useState<NormalizedExperiment[]>([]);
  const [attempt, setAttempt] = useState(0);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [errorByKey, setErrorByKey] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');

      try {
        const subjects = await getSubjects();
        const lists = await Promise.all(subjects.map((subject) => getAllExperiments(subject.id)));

        if (cancelled) return;

        setExperiments(lists.flat());
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load experiments:', err);

        if (!cancelled) setStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  async function togglePublished(experiment: NormalizedExperiment, nextPublished: boolean) {
    const key = experimentRefKey({ subjectId: experiment.subjectId, experimentId: experiment.id });

    if (pendingKeys.has(key)) return;

    setPendingKeys((previous) => new Set(previous).add(key));
    setErrorByKey((previous) => {
      const next = new Map(previous);
      next.delete(key);
      return next;
    });

    try {
      await setExperimentPublished(experiment.subjectId, experiment.id, nextPublished);

      // Only reflect the new state once Firestore has actually confirmed the write.
      setExperiments((previous) =>
        previous.map((item) =>
          item.subjectId === experiment.subjectId && item.id === experiment.id
            ? { ...item, isPublished: nextPublished }
            : item,
        ),
      );
    } catch (err) {
      console.error(`Failed to ${nextPublished ? 'publish' : 'unpublish'} ${key}:`, err);

      setErrorByKey((previous) =>
        new Map(previous).set(
          key,
          nextPublished ? 'Could not publish. Try again.' : 'Could not unpublish. Try again.',
        ),
      );
    } finally {
      setPendingKeys((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }

  const search = query.trim().toLowerCase();

  const visible = experiments.filter((experiment) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'published' ? experiment.isPublished : !experiment.isPublished);

    const subjectName = subjectNameFromId(experiment.subjectId);
    const matchesSearch =
      search === '' ||
      experiment.title.toLowerCase().includes(search) ||
      subjectName.toLowerCase().includes(search);

    return matchesFilter && matchesSearch;
  });

  return (
    <Screen>
      <ScreenHeader
        title="Experiments"
        subtitle="Manage laboratory experiments"
        trailing={
          <PrimaryButton
            title="Create"
            size="sm"
            icon="add"
            fullWidth={false}
            onPress={() => router.push('/(faculty)/experiment/create')}
          />
        }
      />

      <View style={styles.controls}>
        <TextField
          icon="search-outline"
          placeholder="Search experiments..."
          accessibilityLabel="Search experiments"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          trailing={
            query ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={spacing.sm}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons
                  name="close-circle"
                  size={iconSizes.control}
                  color={colors.text.muted}
                />
              </Pressable>
            ) : null
          }
        />

        <View style={styles.filters}>
          {FILTERS.map((option) => {
            const selected = filter === option.value;

            return (
              <Pressable
                key={option.value}
                onPress={() => setFilter(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {status === 'loading' ? (
        <StateView variant="loading" fill={false} message="Loading experiments..." />
      ) : status === 'error' ? (
        <StateView
          variant="error"
          fill={false}
          message="We could not load your experiments. Check your connection and try again."
          onAction={retry}
        />
      ) : (
        <>
          <SectionTitle
            title="Experiments"
            caption={`Showing ${visible.length} of ${experiments.length}`}
            spacedTop
          />

          {visible.length === 0 ? (
            <StateView
              variant="empty"
              fill={false}
              icon="search-outline"
              title="No experiments found"
              message="Try a different search or filter."
            />
          ) : (
            <View style={styles.list}>
              {visible.map((experiment) => {
                const key = experimentRefKey({
                  subjectId: experiment.subjectId,
                  experimentId: experiment.id,
                });

                return (
                  <ExperimentCard
                    key={key}
                    title={experiment.title}
                    subject={subjectNameFromId(experiment.subjectId)}
                    isPublished={experiment.isPublished}
                    pending={pendingKeys.has(key)}
                    errorMessage={errorByKey.get(key) ?? null}
                    onView={() =>
                      router.push({
                        pathname: '/(faculty)/experiment/[id]',
                        params: {
                          id: experiment.id,
                          subjectId: experiment.subjectId,
                        },
                      })
                    }
                    onEdit={() =>
                      router.push({
                        pathname: '/(faculty)/experiment/edit/[id]',
                        params: { id: experiment.id, subjectId: experiment.subjectId },
                      })
                    }
                    onPublish={() => togglePublished(experiment, true)}
                    onUnpublish={() => togglePublished(experiment, false)}
                  />
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    gap: layout.cardGap,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: layout.borderWidth,
    borderColor: colors.border.strong,
    backgroundColor: colors.bg.surface,
  },
  chipSelected: {
    borderColor: colors.primary.default,
    backgroundColor: colors.primary.soft,
  },
  chipText: {
    ...typography.label,
    color: colors.text.secondary,
  },
  chipTextSelected: {
    color: colors.primary.default,
  },
  list: {
    gap: layout.cardGap,
  },
});
