/* Fixture for adopt/infer-tokens.mjs — inline-style and CSS-in-JS drift. */
export function DriftCard() {
  return (
    <div style={{ padding: 12, marginTop: 20, zIndex: 1050, background: '#2563eb' }}>
      <span style={{ color: '#dc2626', fontSize: 14 }}>Overdue</span>
    </div>
  );
}

export const css = `
  .card { box-shadow: 0 1px 2px rgba(0,0,0,.06); padding: 16px; transition: transform 150ms; }
`;
