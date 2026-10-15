import type { ReactNode, SVGProps } from 'react';

/**
 * Ikon garis: kanvas 24px, stroke 1.75, ujung bulat, currentColor.
 * Tampil 18px secara bawaan (14–16px di klip dan kepala lajur).
 * Hanya putar dan jeda yang memakai isian.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCursor = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4l5.5 15 2.2-6.3L19 10.5z" />
  </Icon>
);

export const IconSplit = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="6.5" height="10" rx="1.5" />
    <rect x="14.5" y="7" width="6.5" height="10" rx="1.5" />
    <path d="M12 3v18" />
  </Icon>
);

/** Potong kiri: bagian kiri garis dibuang (garis putus-putus). */
export const IconCutLeft = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="6.5" height="10" rx="1.5" strokeDasharray="2 2.25" />
    <rect x="14.5" y="7" width="6.5" height="10" rx="1.5" />
    <path d="M12 3v18" />
  </Icon>
);

/** Potong kanan: bagian kanan garis dibuang (garis putus-putus). */
export const IconCutRight = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="6.5" height="10" rx="1.5" />
    <rect x="14.5" y="7" width="6.5" height="10" rx="1.5" strokeDasharray="2 2.25" />
    <path d="M12 3v18" />
  </Icon>
);

export const IconText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7V5h14v2M12 5v14M9 19h6" />
  </Icon>
);

export const IconCrop = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3v12a2 2 0 0 0 2 2h12" />
    <path d="M17 21V9a2 2 0 0 0-2-2H3" />
  </Icon>
);

export const IconSpeed = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" />
    <path d="M12 14l3.5-4.5" />
  </Icon>
);

export const IconVolume = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </Icon>
);

export const IconVolumeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Icon>
);

export const IconEffect = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5l1.8 5.2L18 12l-5.2 1.8L11 19l-1.8-5.2L4 12l5.2-1.8z" />
    <path d="M19 3v4M17 5h4" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
  </Icon>
);

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);

export const IconRedo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const IconFilm = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Icon>
);

export const IconMusic = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Icon>
);

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 15.5l-5-5L5 20" />
  </Icon>
);

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const IconEyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4 4l16 16" />
  </Icon>
);

export const IconSkipStart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 5v14" />
    <path d="M18 5.5v13L8.5 12z" />
  </Icon>
);

export const IconSkipEnd = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 5v14" />
    <path d="M6 5.5v13l9.5-6.5z" />
  </Icon>
);

export const IconFullscreen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M8 5.6v12.8a.9.9 0 0 0 1.4.75l10-6.4a.9.9 0 0 0 0-1.5l-10-6.4A.9.9 0 0 0 8 5.6z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const IconPanel = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Icon>
);

export const IconSliders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);
