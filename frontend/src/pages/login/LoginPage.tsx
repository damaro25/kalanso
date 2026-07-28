import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, TextInput, PasswordInput, Button, Title, Alert, Center, Stack } from '@mantine/core';
import { useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Identifiants invalides');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center h="100vh" bg="kalanso.0">
      <Paper shadow="md" p="xl" w={380} withBorder>
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2} c="kalanso.7">
              Kalanso
            </Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={loading} fullWidth>
              Se connecter
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
