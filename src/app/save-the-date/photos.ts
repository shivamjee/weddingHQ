// Photos for the Save the Date: public/save-the-date/photos/NN.jpg.
// Resized to 1000px on the long edge, rotation baked into the pixels, and
// written with NO metadata — iPhone photos carry GPS coordinates, and this page
// is public. Any photo added later needs the same treatment.
// File numbers: the proposal shoot (01–08), then the journey, oldest first.

export type Photo = { src: string; w: number; h: number };

export const PHOTOS: Photo[] = [
  { src: "/save-the-date/photos/01.jpg", w: 1000, h: 667 },
  { src: "/save-the-date/photos/02.jpg", w: 667, h: 1000 },
  { src: "/save-the-date/photos/03.jpg", w: 667, h: 1000 },
  { src: "/save-the-date/photos/04.jpg", w: 666, h: 1000 },
  { src: "/save-the-date/photos/05.jpg", w: 1000, h: 667 },
  { src: "/save-the-date/photos/06.jpg", w: 1000, h: 667 },
  { src: "/save-the-date/photos/07.jpg", w: 1000, h: 667 },
  { src: "/save-the-date/photos/08.jpg", w: 1000, h: 667 },
  { src: "/save-the-date/photos/09.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/10.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/11.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/12.jpg", w: 455, h: 1000 },
  { src: "/save-the-date/photos/13.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/14.jpg", w: 503, h: 1000 },
  { src: "/save-the-date/photos/15.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/16.jpg", w: 800, h: 1000 },
  { src: "/save-the-date/photos/18.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/19.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/20.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/21.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/22.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/23.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/24.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/25.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/26.jpg", w: 562, h: 1000 },
  { src: "/save-the-date/photos/27.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/28.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/29.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/30.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/31.jpg", w: 562, h: 1000 },
  { src: "/save-the-date/photos/32.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/33.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/34.jpg", w: 1000, h: 562 },
  { src: "/save-the-date/photos/35.jpg", w: 562, h: 1000 },
  { src: "/save-the-date/photos/36.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/37.jpg", w: 562, h: 1000 },
  { src: "/save-the-date/photos/38.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/39.jpg", w: 1000, h: 562 },
];

// Looks up by file number, not array position: photos get removed, and the
// numbers below shouldn't all have to shift when one does.
const photo = (n: number) =>
  PHOTOS.find((p) => p.src.endsWith(`/${String(n).padStart(2, "0")}.jpg`))!;

// The fly-through after the envelope: 16 of the 38, so the intro keeps its length
// (and stays in step with the music). Mostly the journey, with two proposal shots
// mixed in, ending on the ring — then the palace doors arrive as the final frame.
export const MONTAGE: Photo[] = [9, 10, 13, 16, 19, 1, 21, 23, 25, 28, 5, 29, 33, 36, 39, 3].map(
  photo,
);

// Our moments: every photo, mixed — a proposal shot about every fifth tile, and
// the journey spread out so neighbours come from different years.
export const GALLERY: Photo[] = [
  9, 21, 33, 14, 3, 26, 38, 19, 31, 6, 12, 24, 36, 1, 29, 10, 22, 34, 8, 15, 27, 39, 20, 4, 32, 13,
  25, 37, 7, 18, 30, 11, 23, 2, 35, 16, 28, 5,
].map(photo);
