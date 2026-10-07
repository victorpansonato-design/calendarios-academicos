/* Ritmo da barra lateral (template Anchieta): itens em 180ms, rótulos de seção
   em 220ms, ambos na mesma curva de desaceleração. */
export const ITEM_MOTION_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
export const SECTION_MOTION_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;
