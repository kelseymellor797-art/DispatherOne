export function InlineLoader({ label }: { label?: string }) {
  return <div style={{ opacity: 0.7, fontSize: 12 }}>{label ?? "Loading..."}</div>;
}
