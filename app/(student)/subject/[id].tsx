import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StateView } from '@/components/ui/StateView';
import {
  colors,
  iconSizes,
  layout,
  spacing,
  typography,
} from '@/constants/theme';

import { getExperiments } from '../../../services/experimentService';

type ExperimentSummary = {
  id: string;
  title?: string;
  aim?: string | string[];
};

type Status = 'loading' | 'ready' | 'error';

const formatSlug = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export default function SubjectPage() {
  const { id } = useLocalSearchParams();
  const subjectId = typeof id === 'string' ? id : undefined;

  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!subjectId) return;

    let cancelled = false;

    async function loadExperiments() {
      try {
        const data = await getExperiments(subjectId as string);

        if (!cancelled) {
          setExperiments(data);
          setStatus('ready');
        }
      } catch (error) {
        console.error('Failed to load experiments:', error);

        if (!cancelled) {
          setStatus('error');
        }
      }
    }

    loadExperiments();

    return () => {
      cancelled = true;
    };
  }, [subjectId, attempt]);

  function retry() {
    setStatus('loading');
    setAttempt((count) => count + 1);
  }

  const view: Status = subjectId ? status : 'error';

  function renderBody() {
    if (view === 'loading') {
      return <StateView variant="loading" message="Loading experiments..." />;
    }

    if (view === 'error') {
      return (
        <StateView
          variant="error"
          message="We could not load the experiments. Check your connection and try again."
          onAction={subjectId ? retry : undefined}
        />
      );
    }

    if (experiments.length === 0) {
      return (
        <StateView
          variant="empty"
          icon="flask-outline"
          title="No experiments yet"
          message="Experiments for this subject will appear here once they are added."
        />
      );
    }

    return (
      <FlatList
        data={experiments}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const aim = Array.isArray(item.aim) ? item.aim[0] : item.aim;

          return (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/(student)/experiment/[id]',
                  params: {
                    subjectId: subjectId as string,
                    id: item.id,
                  },
                })
              }
              style={styles.row}
            >
              <IconTile icon="flask-outline" tone="primary" />

              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title ?? item.id}
                </Text>

                {aim ? (
                  <Text style={styles.rowCaption} numberOfLines={2}>
                    {aim}
                  </Text>
                ) : null}
              </View>

              <Ionicons
                name="chevron-forward"
                size={iconSizes.control}
                color={colors.ui.chevron}
              />
            </Card>
          );
        }}
      />
    );
  }

  const subtitle =
    view === 'ready'
      ? `${experiments.length} ${experiments.length === 1 ? 'experiment' : 'experiments'}`
      : undefined;

  return (
    <Screen scroll={false} edges={PUSHED_EDGES}>
      <ScreenHeader
        variant="pushed"
        title={subjectId ? formatSlug(subjectId) : 'Subject'}
        subtitle={subtitle}
      />

      {renderBody()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: layout.cardGap,
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
