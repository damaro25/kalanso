import type { ComponentType } from 'react';
import { AppShell as MantineAppShell, NavLink as MantineNavLink, Group, Text, Button, Burger, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  IconLayoutDashboard,
  IconUsers,
  IconUserPlus,
  IconChalkboard,
  IconNotebook,
  IconBook2,
  IconTrendingUp,
  IconCalendarTime,
  IconClipboardCheck,
  IconHistory,
  IconMessageCircle,
  IconReportMoney,
  IconReceipt,
  IconTags,
  IconCash,
  IconBriefcase,
  IconBoxSeam,
  IconBooks,
  IconStairs,
  IconLogout,
} from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, type Role } from '../lib/roles';
import { SyncStatusBanner } from '../offline/SyncStatusBanner';

type IconComponent = ComponentType<{ size?: number; stroke?: number }>;

interface MenuItem {
  label: string;
  to: string;
  icon: IconComponent;
  roles?: Role[];
}

interface MenuGroup {
  label: string;
  icon: IconComponent;
  items: MenuItem[];
}

const DASHBOARD: MenuItem = { label: 'Tableau de bord', to: '/dashboard', icon: IconLayoutDashboard };

// Regroupé par activité du quotidien plutôt qu'en liste plate : les utilisateurs
// ne sont pas familiers des outils numériques, moins d'entrées visibles à la fois
// et des icônes pour reconnaître un menu sans avoir à lire chaque libellé.
const GROUPS: MenuGroup[] = [
  {
    label: 'Élèves',
    icon: IconUsers,
    items: [
      { label: 'Élèves', to: '/eleves', icon: IconUsers },
      { label: 'Admissions', to: '/admissions', icon: IconUserPlus, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'SECRETAIRE'] },
      { label: 'Classes', to: '/classes', icon: IconChalkboard },
      { label: 'Notes', to: '/notes', icon: IconNotebook, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'ENSEIGNANT'] },
      { label: 'Matières', to: '/matieres', icon: IconBook2, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT'] },
      {
        label: 'Suivi de parcours',
        to: '/parcours',
        icon: IconTrendingUp,
        roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT'],
      },
      { label: 'Emplois du temps', to: '/emploi-du-temps', icon: IconCalendarTime },
    ],
  },
  {
    label: 'Vie scolaire',
    icon: IconClipboardCheck,
    items: [
      { label: 'Appel du jour', to: '/absences/appel', icon: IconClipboardCheck },
      { label: "Historique d'absences", to: '/absences/historique', icon: IconHistory },
      {
        label: 'Communication',
        to: '/communication',
        icon: IconMessageCircle,
        roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'SECRETAIRE', 'COMPTABLE'],
      },
    ],
  },
  {
    label: 'Finances',
    icon: IconCash,
    items: [
      { label: 'Bilan financier', to: '/finance', icon: IconReportMoney, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'] },
      { label: 'Factures', to: '/finances/factures', icon: IconReceipt, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'] },
      { label: 'Tarifs', to: '/finances/tarifs', icon: IconTags, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'] },
      { label: 'Paie', to: '/paie', icon: IconCash, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'] },
    ],
  },
  {
    label: 'Établissement',
    icon: IconBriefcase,
    items: [
      { label: 'Personnel', to: '/personnel', icon: IconBriefcase, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT'] },
      { label: 'Niveaux', to: '/niveaux', icon: IconStairs, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT'] },
      { label: 'Logistique', to: '/logistique', icon: IconBoxSeam, roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT'] },
      {
        label: 'Bibliothèque',
        to: '/bibliotheque',
        icon: IconBooks,
        roles: ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'SECRETAIRE'],
      },
    ],
  },
];

function estActif(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
  })).filter((group) => group.items.length > 0);

  return (
    <MantineAppShell header={{ height: 60 }} navbar={{ width: 270, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" c="kalanso.7">
              Kalanso
            </Text>
          </Group>
          <Group>
            {user && (
              <Text size="sm">
                {user.prenom} {user.nom} — {ROLE_LABELS[user.role]}
              </Text>
            )}
            <Button
              size="xs"
              variant="light"
              leftSection={<IconLogout size={16} stroke={1.5} />}
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Déconnexion
            </Button>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="md">
        <ScrollArea>
          <MantineNavLink
            component={NavLink}
            to={DASHBOARD.to}
            label={DASHBOARD.label}
            leftSection={<DASHBOARD.icon size={20} stroke={1.5} />}
            active={estActif(location.pathname, DASHBOARD.to)}
            onClick={close}
            mb="sm"
            fw={600}
          />
          {visibleGroups.map((group) => {
            const groupeActif = group.items.some((item) => estActif(location.pathname, item.to));
            return (
              <MantineNavLink
                key={group.label}
                label={group.label}
                leftSection={<group.icon size={20} stroke={1.5} />}
                defaultOpened={groupeActif}
                fw={600}
                childrenOffset={30}
              >
                {group.items.map((item) => (
                  <MantineNavLink
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    label={item.label}
                    leftSection={<item.icon size={18} stroke={1.5} />}
                    active={estActif(location.pathname, item.to)}
                    onClick={close}
                  />
                ))}
              </MantineNavLink>
            );
          })}
        </ScrollArea>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <SyncStatusBanner />
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
