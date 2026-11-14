import { Link } from 'react-router-dom';
import { Button, Card, Icon } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-sm px-6 py-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon name="search" className="h-7 w-7" />
        </span>
        <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">404</p>
        <p className="mt-1 text-sm text-slate-500">
          That page took a different route than expected.
        </p>
        <Link to="/" className="mt-5 inline-block">
          <Button>Back to dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
