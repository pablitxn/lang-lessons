import { createPictureDecodeQueue } from '../../foundation/picture-decode';
import type { NextPicture } from '../../contracts';

/** Image allocation is deferred until the frozen scheduler admits a local descriptor. */
export function createPicturePreload(
  createImage: () => Pick<HTMLImageElement, 'src' | 'decode'> = () => new Image(),
  ready: (picture: NextPicture) => void = () => {},
) {
  return createPictureDecodeQueue(async src => {
    const image = createImage();
    image.src = src;
    await image.decode();
  }, ready);
}
