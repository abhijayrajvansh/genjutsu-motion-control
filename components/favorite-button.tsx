export function FavoriteButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="favorite-button"
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      title={active ? "Remove from favorites" : "Add to favorites"}
      onClick={onClick}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.3.9-4.55 4.45 1.07 6.28L12 17.37l-5.62 2.96 1.07-6.28L2.9 9.6l6.3-.9Z" />
      </svg>
    </button>
  );
}
