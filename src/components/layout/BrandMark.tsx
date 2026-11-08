export function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="30" height="30" rx="5" fill="currentColor" />
      <path
        d="M9 9h14v10l-4 4H9V9Zm7 7 9 9M9 16h7V9"
        stroke="var(--surface)"
        strokeWidth="1.6"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
