import { newPasswordProblem } from '@/lib/passwordRules';

/** 0 (empty) to 4: a password that breaks a rule is always 1; then length and character variety add steps. */
function passwordScore(password: string): number {
  if (!password) return 0;
  if (newPasswordProblem(password)) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  return Math.min(4, 1 + Number(password.length >= 10) + Number(classes >= 2) + Number(classes >= 3));
}

const STRENGTH_LABELS = ['', 'Weak password', 'Fair password', 'Good password', 'Strong password'];
const STAIR_HEIGHTS = ['h-1', 'h-1.5', 'h-2', 'h-2.5'];

/** Password strength for a new password: four ascending steps that fill as it gets stronger,
 *  with the next missing rule as its label until every rule is met. */
export function PasswordStaircase({ password }: { password: string }) {
  const score = passwordScore(password);
  const label = newPasswordProblem(password) || STRENGTH_LABELS[score];
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div aria-hidden="true" className="flex items-end gap-1">
        {STAIR_HEIGHTS.map((height, i) => (
          <span
            key={height}
            className={`w-5 rounded-sm transition-colors duration-base ${height} ${i < score ? 'bg-emerald-500' : 'bg-bg-600'}`}
          />
        ))}
      </div>
      <p className="text-micro text-content-muted">{label}</p>
    </div>
  );
}
