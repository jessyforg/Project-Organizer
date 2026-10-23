import { useEffect, useState, type CSSProperties } from 'react';
import { coverColors, parseCover, type CoverPreset } from '@shared/covers';

/** A preset's two colour tokens, as custom properties the stylesheet mixes (ADR-0019). */
function presetStyle(preset: CoverPreset): CSSProperties {
  const [from, to] = coverColors(preset);
  return {
    ['--cover-from' as string]: `var(--c-${from})`,
    ['--cover-to' as string]: `var(--c-${to})`,
  };
}

export function CoverSwatch({ preset }: { preset: CoverPreset }) {
  return <span className="cover cover--swatch" style={presetStyle(preset)} aria-hidden="true" />;
}

/**
 * A project's or note's cover, above its title. Decorative: nothing but the icon tile is drawn
 * on it, so text never depends on its colours. An image that cannot be loaded shows nothing.
 */
export function CoverBanner({ value }: { value: string | null }) {
  const cover = parseCover(value);
  const image = useCoverImage(cover?.kind === 'image' ? cover.attachmentId : null);
  if (!cover) return null;
  if (cover.kind === 'preset') {
    return (
      <div className="cover cover--banner" style={presetStyle(cover.preset)} aria-hidden="true" />
    );
  }
  if (!image) return <div className="cover cover--banner cover--loading" aria-hidden="true" />;
  return (
    <div className="cover cover--banner cover--image" aria-hidden="true">
      <img src={image} alt="" draggable={false} />
    </div>
  );
}

/** Loads a cover image from the profile as an object URL, released when no longer shown. */
function useCoverImage(id: string | null): string | null {
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let url: string | null = null;
    let cancelled = false;
    void window.api.attachments.readImage({ id }).then((result) => {
      if (cancelled || !result.ok) return;
      const bytes = new Uint8Array(result.data.data);
      url = URL.createObjectURL(new Blob([bytes], { type: result.data.mime }));
      setLoaded({ id, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return loaded && loaded.id === id ? loaded.url : null;
}
