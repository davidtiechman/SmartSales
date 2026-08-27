import { getActionById, getActionsForMode } from "./navigation.js";

export function DetailPanel({
  activeSection,
  mode,
  userName,
  onSelect,
  onBack,
  children,
}) {
  if (!activeSection) {
    return null;
  }

  const actions = getActionsForMode(mode);
  const activeAction = getActionById(mode, activeSection) || {
    title: "פרטים",
    hint: "",
  };

  return (
    <section className="workspace">
      <aside className="workspace-sidebar" aria-label="ניווט">
        <div className="workspace-sidebar__header">
          <p className="eyebrow">{mode === "admin" ? "לוח מנהל" : "לוח סוכן"}</p>
          <strong>{userName}</strong>
        </div>
        <nav className="workspace-nav">
          {actions.map(({ id, title, icon: Icon }) => (
            <button
              className={id === activeSection ? "workspace-nav__item active" : "workspace-nav__item"}
              type="button"
              key={id}
              onClick={() => onSelect(id)}
            >
              <Icon aria-hidden="true" />
              <span>{title}</span>
            </button>
          ))}
        </nav>
        <button className="workspace-back" type="button" onClick={onBack}>
          חזרה 
        </button>
      </aside>

      <main className={`workspace-main workspace-main--${activeSection}`}>
        <header className="workspace-header">
          <p className="eyebrow">פרטים</p>
          <h1>{activeAction.title}</h1>
          {activeAction.hint ? <p className="subtle">{activeAction.hint}</p> : null}
        </header>
        <div className="workspace-content">{children}</div>
      </main>
    </section>
  );
}
