// Catch-all route: anything the route table doesn't know yet (including
// /titles until IMDB-6 lands). Deliberately quiet — one line and a way home.
import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <section className="route-placeholder">
      <h1>Nothing showing here</h1>
      <p>
        This screen doesn’t exist yet. <Link to="/">Back to the marquee</Link>.
      </p>
    </section>
  );
}
