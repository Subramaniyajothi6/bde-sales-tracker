import type { ReactNode } from 'react';

/** Admin page header: title, optional subtitle and tools, optional summary strip under it. */
export function PageHead({ title, sub, tools, children, back }: { title: ReactNode; sub?: ReactNode; tools?: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return (
    <section className="band">
      <div className="band-in">
        <div className="band-title">
          <div>{back}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>
          {tools && <div className="tools no-print">{tools}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}
