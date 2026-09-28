export type Testimonial = {
  quote: string;
  name: string;
  /** Fonction et structure, ex. « Avocate associée, Cabinet Nkeng (Douala) » */
  role: string;
  avatarUrl?: string;
};

/**
 * Emplacements prêts pour les témoignages clients. Ajoutez-y uniquement de vrais avis,
 * avec l'accord écrit de la personne : la section de la landing apparaît automatiquement.
 */
export const testimonials: Testimonial[] = [];
