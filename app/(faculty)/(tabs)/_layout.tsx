import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { iconSizes, tabBar, typography } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
}[] = [
  { name: 'dashboard', title: 'Dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'experiments', title: 'Experiments', icon: 'flask-outline', iconActive: 'flask' },
  { name: 'reports', title: 'Reports', icon: 'bar-chart-outline', iconActive: 'bar-chart' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function FacultyTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBar.activeTint,
        tabBarInactiveTintColor: tabBar.inactiveTint,
        tabBarLabelStyle: typography.tabLabel,
        tabBarStyle: {
          backgroundColor: tabBar.background,
          borderTopColor: tabBar.borderColor,
          borderTopWidth: tabBar.borderTopWidth,
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
