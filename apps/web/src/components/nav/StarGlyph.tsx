type StarGlyphProps = {
  className?: string;
  size?: number;
};

/** Shared four-pointed light-flare/sparkle motif — reused by the nav trigger, ambient background flares, and map markers. */
export function StarGlyph({ className, size = 24 }: StarGlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M50 2 L59.9 40.1 L98 50 L59.9 59.9 L50 98 L40.1 59.9 L2 50 L40.1 40.1 Z"
        fill="currentColor"
      />
    </svg>
  );
}
