/**
 * Évaluation de la robustesse d'un mot de passe (0 à 4), légère et sans dépendance.
 * Règle minimale imposée : 8 caractères, au moins une lettre et un chiffre.
 */

const COMMON = [
  "password",
  "motdepasse",
  "azerty",
  "qwerty",
  "123456",
  "12345678",
  "cameroun",
  "douala",
  "yaounde",
  "quicksign",
  "admin",
  "bonjour",
  "soleil",
];

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export function meetsPasswordPolicy(password: string): boolean {
  return password.length >= 8 && /[a-zA-ZÀ-ÿ]/.test(password) && /\d/.test(password);
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return 0;
  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word)) && password.length < 14) return 1;

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (classes >= 2) score++;
  if (classes >= 3 && password.length >= 10) score++;
  // Répétitions ou suites évidentes (aaaa, 1234, abcd) : on pénalise.
  if (
    /(.)\1{3,}/.test(password) ||
    /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde)/i.test(password)
  )
    score--;

  if (!meetsPasswordPolicy(password)) score = Math.min(score, 1);
  return Math.max(0, Math.min(4, score)) as PasswordStrength;
}
