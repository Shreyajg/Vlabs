import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  iconSizes,
  layout,
  spacing,
  typography,
} from '@/constants/theme';

import { getExperiments } from '../../../services/experimentService';
import { getSubjects } from '../../../services/subjectService';
import { searchSubjectsAndExperiments } from '../../../services/subjectSearch';
import type { NormalizedExperiment } from '../../../types/Experiment';

type Subject = {
  id: string;
  title?: string;
  description?: string;
};

type Status = 'loading' | 'ready' | 'error';

function SubjectRow({ subject }: { subject: Subject }) {
  return (
    <Card onPress={() => router.push(`/subject/${subject.id}`)} style={styles.row}>
      <IconTile icon="flask-outline" tone="primary" />

      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {subject.title ?? subject.id}
        </Text>

        {subject.description ? (
          <Text style={styles.rowCaption} numberOfLines={2}>
            {subject.description}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={iconSizes.control} color={colors.ui.chevron} />
    </Card>
  );
}

function ExperimentRow({ experiment, subjectTitle }: { experiment: NormalizedExperiment; subjectTitle: string }) {
  return (
    <Card
      style={styles.row}
      onPress={() =>
        router.push({
          pathname: '/(student)/experiment/[id]',
          params: { subjectId: experiment.subjectId, id: experiment.id },
        })
      }
    >
      <IconTile icon="flask-outline" tone="mint" />

      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {experiment.title}
        </Text>

        <Text style={styles.rowCaption} numberOfLines={1}>
          {subjectTitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={iconSizes.control} color={colors.ui.chevron} />
    </Card>
  );
}

export default function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [experimentsBySubject, setExperimentsBySubject] = useState<Map<string, NormalizedExperiment[]>>(new Map());
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getSubjects();

        if (cancelled) return;

        setSubjects(data);
        setStatus('ready');

        // Loaded once, up front, in parallel — the same published-only call the Subject screen itself
        // makes for one subject. Typing afterwards filters this in memory; it never issues another read.
        const results = await Promise.allSettled(data.map((subject) => getExperiments(subject.id)));

        if (cancelled) return;

        const bySubject = new Map<string, NormalizedExperiment[]>();

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            bySubject.set(data[index].id, result.value);
          } else {
            // Experiment search for this one subject degrades quietly; subjects still load and browse fine.
            console.warn(`Failed to load experiments for "${data[index].id}":`, result.reason);
          }
        });

        setExperimentsBySubject(bySubject);
      } catch (error) {
        console.log(error);

        if (!cancelled) setStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setStatus('loading');
    setAttempt((count) => count + 1);
  }

  const trimmedQuery = query.trim();
  const searchResult = useMemo(
    () => searchSubjectsAndExperiments(query, subjects, experimentsBySubject),
    [query, subjects, experimentsBySubject],
  );
  const searching = trimmedQuery !== '';
  const hasResults = searchResult.subjects.length > 0 || searchResult.experiments.length > 0;

  function renderBody() {
    if (status === 'loading') {
      return <StateView variant="loading" message="Loading subjects..." />;
    }

    if (status === 'error') {
      return (
        <StateView
          variant="error"
          message="We could not load the subjects. Check your connection and try again."
          onAction={retry}
        />
      );
    }

    if (subjects.length === 0) {
      return (
        <StateView
          variant="empty"
          icon="library-outline"
          title="No subjects yet"
          message="Subjects will appear here once they are added."
        />
      );
    }

    if (searching && !hasResults) {
      return (
        <StateView
          variant="empty"
          icon="search-outline"
          title="No subjects or experiments match your search"
          message={`Nothing found for "${trimmedQuery}". Try a different search.`}
          actionLabel="Clear Search"
          onAction={() => setQuery('')}
        />
      );
    }

    if (searching) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {searchResult.subjects.length > 0 ? (
            <View>
              <SectionTitle title="Subjects" />

              <View style={styles.list}>
                {searchResult.subjects.map((subject) => (
                  <SubjectRow key={subject.id} subject={subject} />
                ))}
              </View>
            </View>
          ) : null}

          {searchResult.experiments.length > 0 ? (
            <View>
              <SectionTitle title="Experiments" spacedTop={searchResult.subjects.length > 0} />

              <View style={styles.list}>
                {searchResult.experiments.map(({ experiment, subjectTitle }) => (
                  <ExperimentRow
                    key={`${experiment.subjectId}/${experiment.id}`}
                    experiment={experiment}
                    subjectTitle={subjectTitle}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {subjects.map((subject) => (
            <SubjectRow key={subject.id} subject={subject} />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <Screen scroll={false}>
      <ScreenHeader
        title="Subjects"
        subtitle="Choose a laboratory to explore."
      />

      {status === 'ready' && subjects.length > 0 ? (
        <TextField
          icon="search-outline"
          placeholder="Search subjects and experiments..."
          accessibilityLabel="Search subjects and experiments"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.search}
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
      ) : null}

      {renderBody()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    marginBottom: layout.cardGap,
  },
  list: {
    gap: layout.cardGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  rowTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  rowCaption: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
