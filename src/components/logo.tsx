'use client'

// OpenEir — brand mark: Eir herself. The founder crowned the mascot as THE
// logo ("Use it as Logo. Round."), so the mark is her round portrait — the
// flat vector healer with the amber leaf — cropped tight to its drawn ring.
// Source art: public/mascot/eir-round-256.png (alpha outside the circle).
// The full-square art lives at /mascot/eir-512.png for hero moments.

import Image from 'next/image'
import type { ComponentProps } from 'react'

export function OpenEirLogo({ className, ...rest }: ComponentProps<'span'>) {
  return (
    <span
      role="img"
      aria-label="OpenEir logo"
      {...rest}
      className={`inline-block shrink-0 overflow-hidden rounded-full align-middle ${className ?? ''}`}
    >
      <Image
        src="/mascot/eir-round-256.png"
        alt=""
        width={256}
        height={256}
        className="h-full w-full object-cover"
      />
    </span>
  )
}
