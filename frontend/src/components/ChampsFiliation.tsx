import { SimpleGrid, Text, TextInput } from '@mantine/core';

export interface Personne {
  prenom: string;
  nom: string;
  telephone: string;
  profession: string;
}

export const PERSONNE_VIDE: Personne = { prenom: '', nom: '', telephone: '', profession: '' };

// Prénom, nom, téléphone et profession d'un parent (père ou mère), tous facultatifs.
export function ChampsPersonne({ titre, valeur, onChange }: { titre: string; valeur: Personne; onChange: (p: Personne) => void }) {
  const champ = (cle: keyof Personne, label: string, type?: string) => (
    <TextInput
      label={label}
      type={type}
      value={valeur[cle]}
      onChange={(e) => {
        const v = e.currentTarget.value;
        onChange({ ...valeur, [cle]: v });
      }}
    />
  );
  return (
    <>
      <Text fw={600} size="sm">
        {titre}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {champ('prenom', 'Prénom')}
        {champ('nom', 'Nom')}
        {champ('telephone', 'Téléphone', 'tel')}
        {champ('profession', 'Profession')}
      </SimpleGrid>
    </>
  );
}
