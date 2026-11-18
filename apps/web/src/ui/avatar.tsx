// Avatar: the account's picture, or the first letter of its name on a quiet plate.
import { useEffect, useState } from 'react';

export function Avatar({ name, image, size }: { name: string; image?: string | null; size: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [image]);
  if (image && !broken) {
    return <img src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} data-testid="account-avatar" />;
  }
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? '';
  return (
    <span className="lg-plate grid shrink-0 place-items-center font-semibold text-ink" data-filled="" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} data-testid="account-letter" aria-hidden="true">
      {letter}
    </span>
  );
}
