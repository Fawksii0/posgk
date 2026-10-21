document.getElementById("yr").textContent = new Date().getFullYear();

// Add photos to assets/gallery/ and list their file names here (e.g. "plat1.jpg"); the gallery appears once one loads.
const PHOTOS = [];
const gallery = document.getElementById("gallery");
PHOTOS.forEach((name) => {
  const img = new Image();
  img.alt = "G&K Food";
  img.loading = "lazy";
  img.addEventListener("load", () => { gallery.hidden = false; gallery.appendChild(img); });
  img.src = `assets/gallery/${name}`;
});
