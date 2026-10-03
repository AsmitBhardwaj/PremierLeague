interface StatProps {
  label: string;
  value: string;
  className?: string;
}

export function Stat({ label, value, className = '' }: StatProps) {
  return (
    <div className={`stat ${className}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
