import { SOCIAL_ICON_PATHS, type SocialIcon } from "./social-icons";

/**
 * Icône de réseau social cliquable : pastille discrète, dégradé de la marque
 * (indigo → violet → cyan) au survol et au focus clavier.
 */
export function SocialLink({
  icon,
  label,
  href,
}: {
  icon: SocialIcon;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="group relative flex size-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-[color,border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-transparent hover:text-white hover:shadow-[0_6px_20px_-6px_rgb(124_58_237/0.55)] focus-visible:-translate-y-0.5 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transform-none"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
      <svg viewBox="0 0 24 24" className="relative size-4" fill="currentColor" aria-hidden>
        <path d={SOCIAL_ICON_PATHS[icon]} fillRule={icon === "linkedin" ? "evenodd" : undefined} />
      </svg>
    </a>
  );
}
