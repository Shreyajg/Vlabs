import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, spacing, typography } from '@/constants/theme';

export type ExperimentCardProps = {
  title: string;
  subject: string;
  isPublished: boolean;
  onView: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  /** True while a publish/unpublish write for this card is in flight. */
  pending?: boolean;
  /** Set when the last publish/unpublish write for this card failed. */
  errorMessage?: string | null;
};

export function ExperimentCard({
  title,
  subject,
  isPublished,
  onView,
  onEdit,
  onPublish,
  onUnpublish,
  pending = false,
  errorMessage = null,
}: ExperimentCardProps) {
  return (
    <Card
      variant={isPublished ? 'base' : 'peach'}
      padding="feature"
      style={styles.card}
    >
      <View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <Text style={styles.subject}>{subject}</Text>
      </View>

      <Badge
        label={isPublished ? 'Published' : 'Draft'}
        tone={isPublished ? 'published' : 'draft'}
        dot
      />

      <View style={styles.actions}>
        {isPublished ? (
          <>
            <View style={styles.action}>
              <SecondaryButton
                title="View"
                size="sm"
                icon="eye-outline"
                onPress={onView}
                disabled={pending}
              />
            </View>

            <View style={styles.action}>
              <SecondaryButton
                title="Edit"
                size="sm"
                icon="create-outline"
                onPress={onEdit}
                disabled={pending}
              />
            </View>

            <View style={styles.action}>
              <SecondaryButton
                title="Unpublish"
                size="sm"
                icon="cloud-offline-outline"
                onPress={onUnpublish}
                loading={pending}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.action}>
              <SecondaryButton
                title="Edit"
                size="sm"
                icon="create-outline"
                onPress={onEdit}
                disabled={pending}
              />
            </View>

            <View style={styles.action}>
              <PrimaryButton
                title="Publish"
                size="sm"
                icon="cloud-upload-outline"
                onPress={onPublish}
                loading={pending}
              />
            </View>
          </>
        )}
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text.primary,
  },
  subject: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  error: {
    ...typography.caption,
    color: colors.error.text,
  },
});
