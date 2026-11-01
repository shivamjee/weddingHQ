// Photos for the Save the Date: public/save-the-date/photos/NN.jpg.
// Resized to 1000px on the long edge and stripped of ALL EXIF — iPhone photos
// carry GPS coordinates, and this page is public. Re-strip any photo added later.
// Gallery order: the proposal shoot first (01–12), then the journey (13–26).

export type Photo = { src: string; w: number; h: number };

export const PHOTOS: Photo[] = [
  { src: "/save-the-date/photos/01.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/02.jpg", w: 666, h: 1000 },
  { src: "/save-the-date/photos/03.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/04.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/05.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/06.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/07.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/08.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/09.jpg", w: 666, h: 1000 },
  { src: "/save-the-date/photos/10.jpg", w: 666, h: 1000 },
  { src: "/save-the-date/photos/11.jpg", w: 666, h: 1000 },
  { src: "/save-the-date/photos/12.jpg", w: 1000, h: 666 },
  { src: "/save-the-date/photos/13.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/14.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/15.jpg", w: 461, h: 830 },
  { src: "/save-the-date/photos/16.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/17.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/18.jpg", w: 562, h: 1000 },
  { src: "/save-the-date/photos/19.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/20.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/21.jpg", w: 1000, h: 750 },
  { src: "/save-the-date/photos/22.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/23.jpg", w: 750, h: 1000 },
  { src: "/save-the-date/photos/24.jpg", w: 562, h: 1000 },
  { src: "/save-the-date/photos/25.jpg", w: 667, h: 1000 },
  { src: "/save-the-date/photos/26.jpg", w: 562, h: 1000 },
];

// The fly-through after the envelope: the journey, then the proposal, ending
// on the ring — then the palace doors arrive as the final frame. 1-based.
export const MONTAGE: Photo[] = [13, 15, 16, 17, 18, 19, 20, 22, 23, 26, 1, 2, 4, 8, 12, 3].map(
  (n) => PHOTOS[n - 1],
);
