/* SG Engine - icones minimalistas (traco, 24x24, cor = currentColor) */
"use strict";

const ICON_PATHS = {
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  camera: '<rect x="3" y="7" width="13" height="10" rx="1"/><path d="M16 11l5-3v8l-5-3"/>',
  transition: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -6)"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -6)"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-2L8 14"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
  eraser: '<path d="M8 20h12M5 15l9-9 5 5-8 8H8z"/><path d="M10 11l5 5"/>',
  picker: '<path d="M14 4l6 6M17 7l-9 9-4 1 1-4 9-9"/>',
  move: '<path d="M12 3v18M3 12h18M12 3L9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  bucketall: '<path d="M4 12l6-6 6 6-6 6z"/><path d="M4 12h12"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="13" r="2"/><circle cx="19" cy="20" r="2"/>',
  bucket: '<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14M20 15c1 1.5 1 3 0 3s-1-1.5 0-3z"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  rectfill: '<rect x="4" y="6" width="16" height="12" fill="currentColor"/>',
  marquee: '<path d="M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4"/>',
  anchor: '<circle cx="12" cy="12" r="3"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  body: '<rect x="6" y="3" width="12" height="18" stroke-dasharray="3 2"/>',
  hit: '<rect x="4" y="8" width="16" height="8"/><path d="M8 12h8"/>',
  crop: '<path d="M6 2v16h16M2 6h16v16"/>',
  trim: '<path d="M4 4h16v16H4z" stroke-dasharray="2 2"/><rect x="8" y="8" width="8" height="8"/>',
  grid: '<path d="M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20l1-5L16 4l4 4L9 19z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  // tipos de ator
  player: '<rect x="3" y="8" width="18" height="10" rx="5"/><path d="M7 11v4M5 13h4"/><circle cx="16" cy="12" r="1"/><circle cx="18" cy="14" r="1"/>',
  enemy: '<circle cx="12" cy="6" r="3"/><path d="M12 9v6M7 21l5-6 5 6M6 12h12"/>',
  boss: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  object: '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M5 9h14M5 15h14"/>',
  item: '<path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1 6L12 16.8 6.7 19.6l1-6L3.3 9.4l6-.9z"/>',
  platform: '<path d="M3 20h18M6 15h6M14 10h6"/><circle cx="8" cy="11" r="2"/>',
};

function ICON(name, size = 15) {
  const p = ICON_PATHS[name] || "";
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* troca <span data-icon="x"></span> pelo svg */
function fillIcons(root) { (root || document).querySelectorAll("[data-icon]").forEach((e) => { if (!e.dataset.done) { e.insertAdjacentHTML("afterbegin", ICON(e.dataset.icon)); e.dataset.done = 1; } }); }
document.addEventListener("DOMContentLoaded", () => fillIcons());
