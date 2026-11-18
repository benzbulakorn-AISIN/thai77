import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PlaceImageView } from './PlaceImage';
import type { PlaceImage } from './imageModel';

type Props = {
  image: PlaceImage | null | undefined;
  placeName: string;
  subtitle?: string;
  seed: string;
  color?: string | null;
  icon?: string | null;
  onBack: () => void;
  /** extra button(s) on the top-right corner */
  actions?: ReactNode;
};

/** Big picture at the top of a place page: full width on phones, name over a gradient, back button on top. */
export function PlaceHero({ image, placeName, subtitle, seed, color, icon, onBack, actions }: Props) {
  return (
    <div className="relative -mx-4 -mt-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-2xl">
      <PlaceImageView
        image={image} placeName={placeName} seed={seed} color={color} icon={icon}
        ratio="16/9" rounded={false} eager title={placeName} subtitle={subtitle} className="max-h-[46vh]"
      />
      <button type="button" aria-label="กลับ" onClick={onBack}
        className="absolute left-3 top-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/65">
        <ArrowLeft size={22} />
      </button>
      {actions && <div className="absolute right-3 top-3 z-10 flex gap-2">{actions}</div>}
    </div>
  );
}
