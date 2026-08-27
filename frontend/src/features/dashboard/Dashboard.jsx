import { getActionsForMode } from "./navigation.js";

export function Dashboard({ userName, mode, onSelect }) {
  const actions = getActionsForMode(mode);

  return (
    <section className="panel dashboard">
      <header className="panel__header dashboard__header">
        <div>
          <p className="eyebrow">{mode === "admin" ? "לוח מנהל" : "לוח סוכן"}</p>
          <h1>ברוך הבא, {userName}</h1>
          <p className="subtle">בחר לאן להמשיך.</p>
        </div>
      </header>

      <div className="cards">
        {actions.map(({ id, title, icon: Icon }) => (
          <button className="card" type="button" key={id} onClick={() => onSelect(id)}>
            <Icon aria-hidden="true" />
            <span>{title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
