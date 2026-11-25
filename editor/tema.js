/* tema escuro/claro compartilhado com o SF Pixel (mesma chave salva) */
(function () {
  const K = "sfpixel-theme";
  const set = (t) => { document.documentElement.setAttribute("data-theme", t === "claro" ? "claro" : "escuro"); try { localStorage.setItem(K, t); } catch (e) { /* sem armazenamento */ } };
  let t = "escuro"; try { t = localStorage.getItem(K) || "escuro"; } catch (e) { /* idem */ }
  set(t);
  window.addEventListener("DOMContentLoaded", () => {
    const h = document.querySelector("header") || document.body, b = document.createElement("button");
    b.textContent = "Tema"; b.title = "Trocar tema (escuro / claro)"; b.style.marginLeft = "auto";
    b.onclick = () => set(document.documentElement.getAttribute("data-theme") === "claro" ? "escuro" : "claro");
    h.appendChild(b);
  });
})();
