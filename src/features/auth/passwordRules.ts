export const MIN_PASSWORD = 8;

export type PasswordCheck = {
  /** at least MIN_PASSWORD characters — the only REQUIRED rule */
  length: boolean;
  /** recommended: contains a letter (any language, Thai included) */
  letter: boolean;
  /** recommended: contains a digit */
  digit: boolean;
  /** may the password be submitted? */
  ok: boolean;
};

export function checkPassword(pw: string): PasswordCheck {
  const length = [...pw].length >= MIN_PASSWORD; // count characters, not UTF-16 units
  return { length, letter: /\p{L}/u.test(pw), digit: /\p{Nd}/u.test(pw), ok: length };
}
