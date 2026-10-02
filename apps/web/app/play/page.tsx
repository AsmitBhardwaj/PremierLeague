import { Button } from '../components/Button';

export const metadata = { title: 'Coming soon — 21st Club' };

export default function PlayPage() {
  return (
    <main className="coming-soon">
      <p className="eyebrow">Club builder</p>
      <h1>Coming soon.</h1>
      <p>The squad builder is next onto the pitch.</p>
      <Button href="/" variant="secondary">
        Back home
      </Button>
    </main>
  );
}
