import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, iconSizes, tabBar, typography } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
}[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'subjects', title: 'Subjects', icon: 'library-outline', iconActive: 'library' },
  { name: 'ai', title: 'AI', icon: 'sparkles-outline', iconActive: 'sparkles' },
  { name: 'reports', title: 'Reports', icon: 'document-text-outline', iconActive: 'document-text' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function StudentTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBar.activeTint,
        tabBarInactiveTintColor: tabBar.inactiveTint,
        tabBarLabelStyle: typography.tabLabel,
        tabBarStyle: {
          // A numeric height replaces the default, which includes the inset, so add it back.
          height: tabBar.height + insets.bottom,
          backgroundColor: tabBar.background,
          borderTopColor: tabBar.borderColor,
          borderTopWidth: tabBar.borderTopWidth,
          ...elevation.e0,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? tab.iconActive : tab.icon}
                size={iconSizes.tabBar}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
