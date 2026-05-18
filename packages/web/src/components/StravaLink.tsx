type Props = {
  source: string;
  externalId: string;
  className?: string;
};

export default function StravaLink({ source, externalId, className }: Props) {
  if (source !== "strava") return null;
  return (
    <a
      href={`https://www.strava.com/activities/${externalId}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir no Strava"
      aria-label="Abrir no Strava"
      className={"inline-flex shrink-0 " + (className ?? "")}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        viewBox="90.15 26 331.7 460"
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <polygon
          points="226.172,26.001 90.149,288.345 170.29,288.345 226.172,184.036 281.605,288.345 361.116,288.345"
          fill="currentColor"
        />
        <polygon
          points="361.116,288.345 321.675,367.586 281.605,288.345 220.871,288.345 321.675,485.999 421.851,288.345"
          fill="currentColor"
        />
      </svg>
    </a>
  );
}
