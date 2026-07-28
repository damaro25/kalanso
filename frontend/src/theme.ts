import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Vert-émeraude : confiance et sérieux (finances, administration) sans la froideur
// du bleu par défaut — couleur de marque de Kalanso.
const kalanso: MantineColorsTuple = [
  '#eafbf6',
  '#d3f4ea',
  '#a8e8d6',
  '#7bdbc1',
  '#55cfaf',
  '#34c29d',
  '#17ae89',
  '#0f9678',
  '#0a7c63',
  '#05604c',
];

// Ambre chaud : accent pour les points d'attention (mise en avant, rappels),
// utilisé avec parcimonie pour ne pas concurrencer le vert de marque.
const accent: MantineColorsTuple = [
  '#fff6e5',
  '#ffeac2',
  '#ffd98c',
  '#ffc658',
  '#ffb52e',
  '#fda414',
  '#f08c00',
  '#cc7400',
  '#a85f00',
  '#7a4600',
];

export const theme = createTheme({
  primaryColor: 'kalanso',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  colors: {
    kalanso,
    accent,
  },
  headings: {
    fontWeight: '700',
  },
  components: {
    Paper: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
