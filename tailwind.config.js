function withOpacityValue(varName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${varName}-rgb) / ${opacityValue})`;
    }
    return `var(${varName})`;
  };
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  future: {
    // Apply hover: utilities only on devices that can truly hover, so a tap
    // on touch screens never leaves a stuck hover state behind.
    hoverOnlyWhenSupported: true,
  },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic content text tokens (themeable via CSS variables)
        content: {
          primary: 'var(--color-content-primary)',
          secondary: 'var(--color-content-secondary)',
          tertiary: 'var(--color-content-tertiary)',
          muted: 'var(--color-content-muted)',
          disabled: 'var(--color-content-disabled)',
          subtle: 'var(--color-content-subtle)',
        },
        // Brand action text token
        'on-brand': 'var(--color-text-on-brand)',
        // Semantic overlay background tokens
        'overlay-subtle': 'var(--bg-overlay-subtle)',
        'overlay-default': 'var(--bg-overlay-default)',
        'overlay-strong': 'var(--bg-overlay-strong)',
        // Base surfaces (themeable via CSS variables with opacity support)
        bg: {
          900: withOpacityValue('--color-bg-900'),
          800: withOpacityValue('--color-bg-800'),
          750: withOpacityValue('--color-bg-750'),
          700: withOpacityValue('--color-bg-700'),
          600: withOpacityValue('--color-bg-600'),
          500: withOpacityValue('--color-bg-500'),
          400: '#313747',
        },
        // Primary — teal/emerald accent
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        brand: {
          text: 'var(--color-brand-text)',
          mark: 'var(--color-brand-mark)',
        },
        // Secondary — warm amber for streaks/energy
        secondary: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        // Accent — soft sky for highlights
        accent: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        // Mood colors
        mood: {
          happy: '#fbbf24',
          neutral: '#94a3b8',
          sad: '#60a5fa',
          motivated: '#34d399',
        },
        // Tier colors
        tier: {
          bronze: '#cd7f32',
          silver: '#c0c0c0',
          gold: '#fbbf24',
          platinum: '#e5e7eb',
          diamond: '#60a5fa',
          crown: '#f472b6',
          ace: '#34d399',
          conqueror: '#f97316',
          legend: '#a855f7',
        },
        success: {
          DEFAULT: '#10b981',
          text: 'var(--color-success-text)',
          soft: 'var(--color-success-soft)',
        },
        // Warning is amber (see --color-warning-rgb); opacity modifiers work (bg-warning/10).
        warning: {
          DEFAULT: withOpacityValue('--color-warning'),
          text: 'var(--color-warning-text)',
          'text-muted': 'var(--color-warning-text-muted)',
          soft: 'var(--color-warning-soft)',
        },
        error: {
          DEFAULT: '#ef4444',
          text: 'var(--color-error-text)',
          soft: 'var(--color-error-soft)',
        },
        info: {
          DEFAULT: '#0ea5e9',
          text: 'var(--color-info-text)',
          soft: 'var(--color-info-soft)',
        },
        indigo: {
          DEFAULT: 'var(--badge-indigo-text)',
          text: 'var(--badge-indigo-text)',
          border: 'var(--badge-indigo-border)',
          bg: 'var(--badge-indigo-bg)',
        },
      },
      borderColor: {
        'overlay-subtle': 'var(--border-overlay-subtle)',
        'overlay-default': 'var(--border-overlay-default)',
        'overlay-medium': 'var(--border-overlay-medium)',
        'overlay-strong': 'var(--border-overlay-strong)',
        'overlay-heavy': 'var(--border-overlay-heavy)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        // Primary button hover: a soft emerald lift (lighter than the original 0.6).
        'brand-glow': '0 6px 18px -8px rgb(16 185 129 / 0.45)',
      },
      fontFamily: {
        // Design v3: Geist runs the interface (and bold display numbers); Instrument Serif is reserved
        // for the big moments via font-serif; Geist Mono carries labels, timers and counters.
        sans: ['Geist Variable', 'system-ui', 'sans-serif'],
        display: ['Geist Variable', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['Geist Mono Variable', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'count-up': 'countUp 0.5s ease-out',
        'celebrate': 'celebrate 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'enter-up': 'enterUp var(--duration-enter) var(--ease-emphasized) both',
        'enter-fade': 'enterFade var(--duration-fast) var(--ease-standard) both',
        // No fill-mode on purpose: a retained transform on the view wrapper would
        // become the containing block for any position:fixed descendant.
        'view-enter': 'enterUp var(--duration-enter) var(--ease-emphasized)',
        // Dialog (primitives/Dialog): a centred card on every screen size that rises and sharpens in.
        // Enter ends on `transform: none`, so nothing inside is trapped in a containing block.
        'dialog-in': 'dialogIn 340ms var(--ease-emphasized) both',
        'dialog-out': 'dialogOut 180ms var(--ease-standard) forwards',
        'exit-fade': 'exitFade 200ms var(--ease-standard) forwards',
        'toast-out': 'toastOut 180ms var(--ease-standard) forwards',
        // Scroll reveal (Motion.tsx Reveal): `backwards` holds it hidden through its stagger delay
        // without keeping a transform after it ends.
        'reveal': 'revealUp 450ms var(--ease-emphasized) backwards',
        'pop': 'pop 320ms var(--ease-emphasized)',
        'slide-in-right': 'slideInRight var(--duration-enter) var(--ease-emphasized) both',
        // Uses the individual `translate` property so it composes with the
        // element's own `-translate-x-1/2` centering transform.
        'slide-down': 'slideDown var(--duration-enter) var(--ease-emphasized) both',
        'shake': 'shake 320ms var(--ease-standard)',
        'slide-in-left': 'slideInLeft var(--duration-enter) var(--ease-emphasized) both',
        // Boot overlay (AscendLoadingOverlay): the entrance mirrors index.html's splash
        // (.sp-enter); exit durations are set inline from OVERLAY_EXIT_MS.
        'boot-enter': 'bootEnter 400ms var(--ease-emphasized) both',
        'boot-lift': 'bootLift var(--ease-emphasized) both',
        'overlay-exit': 'enterFade var(--ease-standard) reverse both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        celebrate: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '55%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Page stagger (Reveal): a touch more travel than enterUp so the open reads as one settle.
        revealUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        enterUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        dialogIn: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.95)', filter: 'blur(6px)' },
          '100%': { opacity: '1', transform: 'none', filter: 'none' },
        },
        dialogOut: {
          '0%': { opacity: '1', transform: 'none' },
          '100%': { opacity: '0', transform: 'translateY(8px) scale(0.96)', filter: 'blur(4px)' },
        },
        exitFade: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        toastOut: {
          '0%': { opacity: '1', transform: 'none' },
          '100%': { opacity: '0', transform: 'translateX(16px)' },
        },
        enterFade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '60%': { opacity: '1', transform: 'scale(1.12)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bootEnter: {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        bootLift: {
          '0%': { opacity: '1', transform: 'none' },
          '100%': { opacity: '0', transform: 'scale(1.08)' },
        },
        slideDown: {
          '0%': { opacity: '0', translate: '0 -8px' },
          '100%': { opacity: '1', translate: '0 0' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        enter: 'var(--duration-enter)',
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
      },
      zIndex: {
        sticky: 'var(--z-sticky)',
        drawer: 'var(--z-drawer)',
        modal: 'var(--z-modal)',
        popover: 'var(--z-popover)',
        toast: 'var(--z-toast)',
        blocking: 'var(--z-blocking)',
      },
      // Small end of the type scale (Tailwind's xs = 12px and up cover the rest). Size only, so
      // line height keeps following the surrounding text, as the arbitrary sizes they replace did.
      fontSize: {
        // Design v3: one step up for readability (was 9/10/11px).
        '3xs': '0.625rem', // 10px: tiny chips and counters
        '2xs': '0.6875rem', // 11px: badges, meta labels
        micro: '0.75rem', // 12px: captions, helper text, nav labels
      },
    },
  },
  plugins: [],
};
