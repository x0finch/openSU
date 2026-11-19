// Avatar: the account's picture, or the first letter of its name on a quiet plate. Base UI's Avatar (task 033): the
// picture shows once it has loaded; until then, or if it fails, the letter.
import { Avatar as BaseAvatar } from '@base-ui/react/avatar';

export function Avatar({ name, image, size }: { name: string; image?: string | null; size: number }) {
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? '';
  return (
    <BaseAvatar.Root className="relative grid shrink-0 place-items-center overflow-hidden rounded-full" style={{ width: size, height: size }} data-slot="avatar">
      {image && <BaseAvatar.Image src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" className="size-full object-cover" data-testid="account-avatar" />}
      <BaseAvatar.Fallback className="lg-plate grid size-full place-items-center font-semibold text-ink" data-filled="" style={{ fontSize: Math.round(size * 0.42) }} data-testid="account-letter" aria-hidden="true">
        {letter}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
