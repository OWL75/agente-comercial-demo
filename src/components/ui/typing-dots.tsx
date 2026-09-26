export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="h-1 w-1 animate-typing rounded-full bg-current" />
      <span className="h-1 w-1 animate-typing rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-1 w-1 animate-typing rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}
