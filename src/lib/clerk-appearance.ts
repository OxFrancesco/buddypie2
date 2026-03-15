/**
 * BuddyPie-themed Clerk appearance.
 * Matches app palette: cream background, near-black foreground, warm yellow accent,
 * sharp corners (0 radius), 2px borders, offset box shadows, uppercase bold typography.
 */
export const clerkAppearance = {
  cssLayerName: 'clerk',
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: 'var(--foreground)',
    colorPrimaryForeground: 'var(--background)',
    colorBackground: 'var(--card)',
    colorForeground: 'var(--foreground)',
    colorMuted: 'var(--muted)',
    colorMutedForeground: 'var(--muted-foreground)',
    colorDanger: 'var(--destructive)',
    colorBorder: 'var(--border)',
    colorInput: 'var(--background)',
    colorInputForeground: 'var(--foreground)',
    colorRing: 'var(--ring)',
    colorShadow: 'var(--foreground)',
    colorModalBackdrop: 'oklch(0.13 0 0 / 0.4)',
    fontFamily: "'Geist Variable', sans-serif",
    fontFamilyButtons: "'Geist Variable', sans-serif",
    fontWeight: { normal: 400, medium: 600, semibold: 700, bold: 800 },
    borderRadius: '0',
    spacing: '1rem',
  },
  elements: {
    // Sign-in / Sign-up card
    card: 'border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]',
    rootBox: 'w-full max-w-md',
    // Primary action button (Sign in, Continue, etc.)
    formButtonPrimary: {
      border: '2px solid var(--foreground)',
      backgroundColor: 'var(--foreground)',
      color: 'var(--background)',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      boxShadow: '4px 4px 0 var(--foreground)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      '&:hover': {
        transform: 'translate(2px, 2px)',
        boxShadow: 'none',
      },
    },
    // Secondary / social / outline buttons
    formButtonReset: {
      border: '2px solid var(--foreground)',
      backgroundColor: 'transparent',
      color: 'var(--foreground)',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      boxShadow: '2px 2px 0 var(--foreground)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      '&:hover': {
        backgroundColor: 'var(--muted)',
        transform: 'translate(1px, 1px)',
        boxShadow: 'none',
      },
    },
    // Input fields
    formFieldInput: {
      border: '2px solid var(--foreground)',
      backgroundColor: 'var(--background)',
      boxShadow: '2px 2px 0 var(--foreground)',
    },
    headerTitle: 'font-black uppercase tracking-wider',
    headerSubtitle: 'text-muted-foreground',
    footer: { display: 'none' },
    footerAction: { display: 'none' },
  },
  layout: {
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
    showOptionalFields: false,
  },
}
