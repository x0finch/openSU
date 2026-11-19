// The Base UI parts a component's children use, handed down by the lazily
// loaded tree (popover-base.tsx, menu-base.tsx) so the eager modules do not
// import Base UI's Popover and Menu.
import type { Menu as BaseMenu } from '@base-ui/react/menu';
import type { Popover as BasePopover } from '@base-ui/react/popover';
import { createContext } from 'react';

export const PopoverParts = createContext<{ Close: typeof BasePopover.Close } | null>(null);
export const MenuParts = createContext<{ Item: typeof BaseMenu.Item; Separator: typeof BaseMenu.Separator } | null>(null);
