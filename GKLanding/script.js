(() => {
  document.getElementById("yr").textContent = new Date().getFullYear();

  const toggle = document.querySelector(".menu-toggle");
  const links = document.getElementById("nav-links");
  toggle.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", String(links.classList.toggle("open")));
  });
  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
  });

  // Add photos to assets/gallery/ and list their file names here (e.g. "plat1.jpg"); they appear in the gallery.
  const PHOTOS = [];
  const grid = document.getElementById("gallery");
  PHOTOS.forEach((name) => {
    const fig = document.createElement("figure");
    const img = new Image();
    img.src = `assets/gallery/${name}`;
    img.alt = "G&K Food";
    img.loading = "lazy";
    img.addEventListener("error", () => fig.remove());
    fig.appendChild(img);
    grid.appendChild(fig);
  });
})();
