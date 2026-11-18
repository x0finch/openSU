// The one responsive rule of the base (task 029): the phone layout is
// anything narrower than 768 px or lower than 520 px (a phone held
// sideways). Popover becomes Sheet there.
import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 768px) and (min-height: 520px)';

export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof matchMedia === 'function' && !matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(DESKTOP_QUERY);
    const on = () => setPhone(!mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
