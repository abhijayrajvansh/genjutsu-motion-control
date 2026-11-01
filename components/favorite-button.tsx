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
      <svg width="13" height="13" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.3.9-4.55 4.45 1.07 6.28L12 17.37l-5.62 2.96 1.07-6.28L2.9 9.6l6.3-.9Z" />
      </svg>
    </button>
  );
}
export function ArchiveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="archive-button"
      aria-label="Archive generation"
      title="Archive generation"
      onClick={onClick}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
      </svg>
    </button>
  );
}
