export function Panel({ eyebrow, title, hint, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel__header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {hint ? <p className="subtle">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

