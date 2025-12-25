(async () => {
  const CONFIG = {
    textValue: "-",
    delayMs: 500,         // jeda antar part biar aman
    fromCurrentPart: true // true = mulai dari part kamu sekarang; false = mulai dari part paling awal
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Ambil daftar semua link Part dari navbar (hlm1) + halaman sekarang
  const getPartUrlsFromPage = () => {
    const links = Array.from(document.querySelectorAll('a.hlm1[href*="offset="]'))
      .map(a => new URL(a.getAttribute("href"), location.href).toString());

    const current = new URL(location.href).toString();

    // dedupe
    const all = Array.from(new Set([current, ...links]));

    // sort by offset numeric
    all.sort((u1, u2) => {
      const o1 = Number(new URL(u1).searchParams.get("offset") || 0);
      const o2 = Number(new URL(u2).searchParams.get("offset") || 0);
      return o1 - o2;
    });

    return all;
  };

  const autoFillInDocument = (doc) => {
    // RADIO: group by name
    const radioGroups = {};
    doc.querySelectorAll('input[type="radio"]').forEach(radio => {
      if (radio.disabled) return;
      const name = radio.getAttribute("name") || "__no_name__";
      (radioGroups[name] ||= []).push(radio);
    });

    Object.values(radioGroups).forEach(group => {
      const usable = group.filter(r => !r.disabled);
      if (usable.length === 4) {
        usable[3].checked = true; // pilih radio ke-4
      } else if (usable.length === 2) {
        usable[1].checked = true; // pilih radio ke-2
      }
    });

    // TEXT + TEXTAREA
    doc.querySelectorAll('input[type="text"], textarea').forEach(input => {
      if (input.disabled) return;
      input.value = CONFIG.textValue;
    });
  };

  const submitFormFromHtml = async (pageUrl) => {
    // 1) GET page html
    const res = await fetch(pageUrl, { credentials: "include" });
    const html = await res.text();

    // 2) Parse jadi DOM
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // 3) Cari form (biasanya cuma 1)
    const form = doc.querySelector("form");
    if (!form) {
      throw new Error("Form tidak ditemukan di: " + pageUrl);
    }

    // 4) Isi jawaban
    autoFillInDocument(doc);

    // 5) Siapkan FormData
    const formData = new FormData(form);

    // 6) Kalau submit-nya pakai input type="image" name="button"
    // server kadang expect button.x & button.y
    const imgBtn = form.querySelector('input[type="image"][name]');
    if (imgBtn) {
      const n = imgBtn.getAttribute("name");
      // simulasi klik tombol image
      formData.set(`${n}.x`, "1");
      formData.set(`${n}.y`, "1");
    }

    // 7) Tentukan target action URL
    const actionAttr = form.getAttribute("action") || pageUrl;
    const actionUrl = new URL(actionAttr, pageUrl).toString();

    const method = (form.getAttribute("method") || "GET").toUpperCase();

    // 8) Submit
    let submitRes;
    if (method === "GET") {
      // serialize FormData ke querystring
      const qs = new URLSearchParams();
      for (const [k, v] of formData.entries()) qs.append(k, v);
      const finalUrl = actionUrl.includes("?")
        ? actionUrl + "&" + qs.toString()
        : actionUrl + "?" + qs.toString();

      submitRes = await fetch(finalUrl, {
        method: "GET",
        credentials: "include",
      });
    } else {
      submitRes = await fetch(actionUrl, {
        method: method,
        body: formData,
        credentials: "include",
      });
    }

    return submitRes;
  };

  // MAIN
  const allParts = getPartUrlsFromPage();
  if (allParts.length < 2) {
    console.warn("Link Part tidak ketemu banyak. Pastikan ada <a class='hlm1'> Part 2/3 dst.");
  }

  const currentOffset = Number(new URL(location.href).searchParams.get("offset") || 0);
  const partsToRun = CONFIG.fromCurrentPart
    ? allParts.filter(u => Number(new URL(u).searchParams.get("offset") || 0) >= currentOffset)
    : allParts;

  console.log("[AutoSurvey] Part ditemukan:", allParts.map(u => new URL(u).searchParams.get("offset")));

  for (const url of partsToRun) {
    const offset = new URL(url).searchParams.get("offset");
    console.log(`[AutoSurvey] Proses offset=${offset} ...`);

    try {
      const submitRes = await submitFormFromHtml(url);
      console.log(`[AutoSurvey] Submit offset=${offset} -> status ${submitRes.status}`);
    } catch (err) {
      console.error(`[AutoSurvey] Gagal offset=${offset}`, err);
      console.log("[AutoSurvey] Berhenti di offset ini:", url);
      return;
    }

    await sleep(CONFIG.delayMs);
  }

  console.log("[AutoSurvey] Selesai semua part yang diproses.");

  // Opsional: buka part terakhir biar kamu lihat
  // location.href = partsToRun[partsToRun.length - 1];
})();
