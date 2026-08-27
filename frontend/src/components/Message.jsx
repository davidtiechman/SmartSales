export function Message({ children }) {
  if (!children) {
    return null;
  }
  return <p className="message">{children}</p>;
}

