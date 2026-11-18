export const metadata = { title: "ContactExtractor crawler" };

export default function BotPage() {
  return (
    <main className="prose">
      <div className="eyebrow">CONTACT EXTRACTOR / CRAWLER</div>
      <h1>About the ContactExtractor crawler</h1>
      <p>
        Requests with the user agent <code>ContactExtractor/1.0</code> come from Contact Extractor, a tool that reads the contact details businesses publish on their own
        websites (contact, imprint and about pages) on behalf of our users.
      </p>
      <ul>
        <li>We fetch a handful of pages per site (8 at most by default), a few at a time, with timeouts and size limits.</li>
        <li>
          We honour <code>robots.txt</code>. To opt out, add <code>User-agent: ContactExtractor</code> with <code>Disallow: /</code>.
        </li>
        <li>We do not log in, submit forms, solve challenges or bypass bot protection. If a site blocks us, we stop.</li>
        <li>We never fetch private or internal network addresses.</li>
      </ul>
    </main>
  );
}
