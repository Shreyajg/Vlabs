import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { askFluidAgent } from '@/services/fluidAgentService';

import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/Badge';
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
  input,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const SUGGESTIONS = [
  { icon: 'flask-outline', text: 'Explain this experiment' },
  { icon: 'help-circle-outline', text: 'What is Reynolds number?' },
  { icon: 'calculator-outline', text: 'Help with calculations' },
] as const;

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);
  const nextId = useRef(0);


  const canSend = draft.trim().length > 0 && !pending;

  function createId() {
    nextId.current += 1;
    return `message-${nextId.current}`;
  }

  async function send(rawText: string) {
  const text = rawText.trim();

  if (!text || pending) return;

  setMessages((previous) => [
    ...previous,
    {
      id: createId(),
      role: 'user',
      text,
    },
  ]);

  setDraft('');
  setPending(true);

  try {
    const response = await askFluidAgent({
      question: text,
    });

    setMessages((previous) => [
      ...previous,
      {
        id: createId(),
        role: 'assistant',
        text:response.answer[0].text,
      },
    ]);
} catch (error) {
    console.error('AI Assistant error:', error);

    setMessages((previous) => [
      ...previous,
      {
        id: createId(),
        role: 'assistant',
        text: 'Sorry, I could not reach the AI service. Please try again.',
      },
    ]);
  } finally {
    setPending(false);
  }
}
  function startNewChat() {
  setMessages([]);
  setDraft('');
  setPending(false);
}

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll={false}
        footer={
          <View style={styles.footer}>
            <View style={styles.note}>
              <Ionicons
                name="information-circle-outline"
                size={iconSizes.banner}
                color={colors.text.secondary}
              />

              <Text style={styles.noteText}>
                Answers are generated using the Fluid Mechanics laboratory manual.
              </Text>
            </View>

            <View style={styles.composer}>
              <TextField
                containerStyle={styles.composerField}
                accessibilityLabel="Message"
                placeholder="Ask something..."
                value={draft}
                onChangeText={setDraft}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => send(draft)}
              />

              <Pressable
                onPress={() => send(draft)}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !canSend }}
                style={({ pressed }) => [
                  styles.sendButton,
                  {
                    backgroundColor: !canSend
                      ? colors.disabled.bg
                      : pressed
                        ? colors.primary.pressed
                        : colors.primary.default,
                  },
                ]}
              >
                <Ionicons
                  name="send"
                  size={iconSizes.control}
                  color={canSend ? colors.text.onPrimary : colors.disabled.text}
                />
              </Pressable>
            </View>
          </View>
        }
      >
        <ScreenHeader
          title="AI Assistant"
          subtitle="Ask questions about experiments, concepts or calculations."
          action={
            messages.length > 0
              ? {
                  icon: 'refresh',
                  onPress: startNewChat,
                  accessibilityLabel: 'Start a new chat',
                }
              : undefined
          }
        />

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }}
          renderItem={({ item }) => <MessageRow message={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View>
                <SectionTitle title="Suggested questions" />

                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((suggestion) => (
                    <Card
                      key={suggestion.text}
                      onPress={() => send(suggestion.text)}
                      style={styles.suggestion}
                    >
                      <IconTile icon={suggestion.icon} tone="ai" size="sm" />

                      <Text style={styles.suggestionText}>
                        {suggestion.text}
                      </Text>

                      <Ionicons
                        name="chevron-forward"
                        size={iconSizes.control}
                        color={colors.ui.chevron}
                      />
                    </Card>
                  ))}
                </View>
              </View>

              <StateView
                variant="empty"
                tone="ai"
                fill={false}
                icon="chatbubbles-outline"
                title="Start a conversation"
                message="Your conversation will appear here. Choose a suggestion or type your own question below."
              />
            </View>
          }
          ListFooterComponent={pending ? <TypingRow /> : null}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {isUser ? null : <IconTile icon="sparkles-outline" tone="ai" size="sm" />}

      <View
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
      >
        {isUser ? null : <Badge label="AI" tone="ai" />}

        <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

function TypingRow() {
  return (
    <View style={[styles.messageRow, styles.typingRow]}>
      <IconTile icon="sparkles-outline" tone="ai" size="sm" />

      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <ActivityIndicator size="small" color={colors.ai.default} />

        <Text style={styles.typingText}>Thinking...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg.page,
  },

  listContent: {
    flexGrow: 1,
    gap: layout.cardGap,
  },

  empty: {
    gap: layout.sectionGap,
  },
  suggestions: {
    gap: layout.cardGap,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  suggestionText: {
    ...typography.title,
    color: colors.text.primary,
    flex: 1,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  typingRow: {
    marginTop: layout.cardGap,
  },
  bubble: {
    maxWidth: '85%',
    flexShrink: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  bubbleUser: {
    backgroundColor: colors.primary.default,
    borderBottomRightRadius: radius.xs,
  },
  bubbleAssistant: {
    backgroundColor: colors.bg.surface,
    borderWidth: layout.borderWidth,
    borderColor: colors.border.default,
    borderBottomLeftRadius: radius.xs,
  },
  messageText: {
    ...typography.body,
    color: colors.text.primary,
  },
  messageTextUser: {
    color: colors.text.onPrimary,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    ...typography.caption,
    color: colors.text.secondary,
  },

  footer: {
    gap: spacing.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noteText: {
    ...typography.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  composerField: {
    flex: 1,
  },
  sendButton: {
    width: input.height,
    height: input.height,
    borderRadius: input.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
