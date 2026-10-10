/**
 * In-app Ascend logo. Both theme variants are rendered and CSS
 * (`.app-logo-dark` / `.app-logo-light` in index.css) shows the one matching
 * `data-theme`, so the logo switches with the theme without a store subscription.
 */
export function AppLogo({ className = '' }: { className?: string }) {
  return (
    <>
      <img src="/logo-dark.svg" alt="Ascend Logo" className={`app-logo-dark ${className}`} />
      <img src="/logo-light.svg" alt="Ascend Logo" className={`app-logo-light ${className}`} />
    </>
  );
}
