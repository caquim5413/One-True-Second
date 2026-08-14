// -------------------- ELEMENTOS DEL DOM

const grid = document.querySelector(".grid");
const gridView = document.getElementById("grid-view");
const dayView = document.getElementById("day-view");

const dayTitle = document.getElementById("day-title");
const saveStatusEl = document.getElementById("save-status");
const dayText = document.getElementById("day-text");
const dayTagsInput = document.getElementById("day-tags");

const backButton = document.getElementById("back");
const imageInput = document.getElementById("image-input");
const imageGallery = document.getElementById("image-gallery");

const jumpDateInput = document.getElementById("jump-date-input");

const searchBtn = document.getElementById("search-btn");
const searchPanel = document.getElementById("search-panel");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

const exportBackupBtn = document.getElementById("export-backup-btn");

const tagManagerBtn = document.getElementById("tag-manager-btn");
const tagManagerPanel = document.getElementById("tag-manager-panel");
const tagManagerList = document.getElementById("tag-manager-list");
const tagManagerStatus = document.getElementById("tag-manager-status");

// -------------------- FECHAS

const startDate = new Date(2025, 0, 1);
const today = new Date();

// -------------------- ESTADO

let driveReady = false;

let activeDateKey = null;
let activeDayDiv = null;
let activeDayData = null; // { text, photos: [{id, name}] } del día abierto

// dateKey -> elemento del grid, para poder marcarlos luego
const dayDivs = {};

// dateKey -> datos del día ya cargados (texto, fotos, etiquetas),
// para no tener que volver a pedirlos a Drive
const dayDataCache = {};

// etiqueta en minúsculas -> Set de dateKeys que la tienen
const tagIndex = {};

// etiqueta en minúsculas -> cómo se escribió la última vez (para
// que las sugerencias respeten mayúsculas, ej. "Ana")
const tagDisplayNames = {};

// -------------------- TEXTOS

const weekDaysShort = [
    "dom","lun","mar","mie","jue","vie","sáb"
];

const monthNamesShort = [
    "ene","feb","mar","abr","may","jun",
    "jul","ago","sep","oct","nov","dic"
];

const monthNamesLong = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

// -------------------- ETIQUETAS: PARSEO, FORMATO E ÍNDICE

function parseTags(raw) {

    return Array.from(
        new Set(
            raw
                .split(/[\s,]+/)
                .map((t) => t.replace(/^#/, "").trim())
                .filter((t) => t.length > 0)
        )
    );

}

function formatTags(tags) {
    return (tags || []).map((t) => `#${t}`).join(" ");
}

function indexTags(dateKey, tags) {

    removeFromTagIndex(dateKey);

    (tags || []).forEach((tag) => {

        const key = tag.toLowerCase();

        if (!tagIndex[key]) tagIndex[key] = new Set();

        tagIndex[key].add(dateKey);
        tagDisplayNames[key] = tag;

    });

    scheduleSuggestionsRefresh();

}

function removeFromTagIndex(dateKey) {

    Object.values(tagIndex).forEach((set) => set.delete(dateKey));

}

// -------------------- SUGERENCIAS DE ETIQUETAS
// (autocompletado en el buscador + pastillas en el día)

let refreshSuggestionsTimeout = null;

function scheduleSuggestionsRefresh() {

    // Durante la carga inicial se indexan muchos días seguidos;
    // agrupamos los refrescos para no repintar cientos de veces.
    clearTimeout(refreshSuggestionsTimeout);
    refreshSuggestionsTimeout = setTimeout(refreshTagSuggestions, 300);

}

function refreshTagSuggestions() {

    refreshTagDatalist();
    renderTagChips();

}

function refreshTagDatalist() {

    const datalist = document.getElementById("known-tags-list");

    if (!datalist) return;

    datalist.innerHTML = "";

    Object.keys(tagDisplayNames)
        .sort()
        .forEach((key) => {

            const option = document.createElement("option");
            option.value = `#${tagDisplayNames[key]}`;

            datalist.appendChild(option);

        });

}

function renderTagChips() {

    const container = document.getElementById("tag-chips");

    if (!container) return;

    container.innerHTML = "";

    Object.keys(tagDisplayNames)
        .sort()
        .forEach((key) => {

            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "tag-chip";
            chip.dataset.tagKey = key;
            chip.textContent = `#${tagDisplayNames[key]}`;

            chip.addEventListener("click", () => {
                toggleTagInInput(tagDisplayNames[key]);
            });

            container.appendChild(chip);

        });

    updateTagChipsActiveState();

}

function updateTagChipsActiveState() {

    const container = document.getElementById("tag-chips");

    if (!container) return;

    const current = new Set(
        parseTags(dayTagsInput.value).map((t) => t.toLowerCase())
    );

    container.querySelectorAll(".tag-chip").forEach((chip) => {
        chip.classList.toggle("active", current.has(chip.dataset.tagKey));
    });

}

function toggleTagInInput(tag) {

    if (!activeDateKey) return;

    const current = parseTags(dayTagsInput.value);
    const key = tag.toLowerCase();

    const alreadyThere = current.some((t) => t.toLowerCase() === key);

    const updated = alreadyThere
        ? current.filter((t) => t.toLowerCase() !== key)
        : [...current, tag];

    dayTagsInput.value = formatTags(updated);

    // Reutilizamos el mismo listener de guardado que si lo hubieras
    // escrito a mano
    dayTagsInput.dispatchEvent(new Event("input"));

}

// -------------------- CUANDO DRIVE YA ESTÁ LISTO
// (lo llama google.js justo después de iniciar sesión y crear las carpetas)

async function onDriveReady() {

    driveReady = true;
    await markEntries();

}

// -------------------- MARCAR EN EL GRID QUÉ DÍAS TIENEN ENTRADA

async function markEntries() {

    const years = [];

    for (let y = startDate.getFullYear(); y <= today.getFullYear(); y++) {
        years.push(y);
    }

    for (const year of years) {

        let dates;

        try {
            dates = await drive.listDatesInYear(year);
        } catch (err) {
            console.error(`No se pudieron listar los días de ${year}`, err);
            continue;
        }

        // Cargamos todos los días de este año a la vez (en paralelo),
        // no uno detrás de otro, para que no tarde una eternidad.
        await Promise.all(
            dates.map((dateKey) => loadEntryPreview(dateKey))
        );

    }

}

async function loadEntryPreview(dateKey) {

    const dayDiv = dayDivs[dateKey];

    if (!dayDiv) return;

    dayDiv.classList.add("has-entry");

    try {

        const dayData = await drive.loadDay(dateKey);

        dayData.tags = dayData.tags || [];

        dayDataCache[dateKey] = dayData;
        indexTags(dateKey, dayData.tags);

        if (dayData.photos && dayData.photos.length > 0) {

            const thumbUrl = await drive.getPhotoThumbnail(
                dayData.photos[0].id
            );

            if (thumbUrl) {

                dayDiv.style.backgroundImage = `url(${thumbUrl})`;
                dayDiv.style.backgroundSize = "cover";
                dayDiv.style.backgroundPosition = "center";
                dayDiv.textContent = "";
                dayDiv.classList.add("has-image");

            }

        }

    } catch (err) {
        console.error(`No se pudo previsualizar ${dateKey}`, err);
    }

}

// -------------------- ABRIR UN DÍA

async function openDay(dateKey, day, month, year, dayDiv) {

    if (!driveReady) {
        alert("Primero tienes que iniciar sesión con Google.");
        return;
    }

    activeDateKey = dateKey;
    activeDayDiv = dayDiv;

    gridView.style.display = "none";
    dayView.style.display = "block";

    dayTitle.textContent = `${day} de ${monthNamesLong[month]} de ${year}`;

    dayText.value = "Cargando...";
    dayText.disabled = true;
    dayTagsInput.value = "";
    dayTagsInput.disabled = true;
    imageInput.disabled = true;
    document.getElementById("image-input-label").classList.add("disabled");
    imageGallery.innerHTML = "";
    setSaveStatus("", "");

    let dayData;

    if (dayDataCache[dateKey]) {

        dayData = dayDataCache[dateKey];

    } else {

        try {
            dayData = await drive.loadDay(dateKey);
        } catch (err) {
            console.error(err);
            alert("No se pudo cargar este día. Revisa la consola.");
            dayData = { text: "", photos: [] };
        }

    }

    dayData.photos = dayData.photos || [];
    dayData.tags = dayData.tags || [];

    dayDataCache[dateKey] = dayData;
    indexTags(dateKey, dayData.tags);

    activeDayData = dayData;

    dayText.value = dayData.text || "";
    dayText.disabled = false;

    dayTagsInput.value = formatTags(dayData.tags);
    updateTagChipsActiveState();
    dayTagsInput.disabled = false;

    imageInput.disabled = false;
    document.getElementById("image-input-label").classList.remove("disabled");
    imageInput.value = "";

    await renderGallery();

}

// -------------------- PINTAR LA GALERÍA DEL DÍA ABIERTO

async function renderGallery() {

    imageGallery.innerHTML = "";

    for (const photo of activeDayData.photos) {

        try {

            const url = await drive.getPhotoThumbnail(photo.id, 1600);

            const wrapper = document.createElement("div");
            wrapper.className = "photo-item";

            const img = document.createElement("img");
            img.src = url;
            img.className = "day-photo";

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-photo-btn";
            deleteBtn.textContent = "✕";
            deleteBtn.title = "Eliminar esta foto";
            deleteBtn.type = "button";

            deleteBtn.addEventListener("click", () => {
                deletePhoto(photo.id);
            });

            const downloadBtn = document.createElement("button");
            downloadBtn.className = "download-photo-btn";
            downloadBtn.textContent = "⬇";
            downloadBtn.title = "Descargar esta foto";
            downloadBtn.type = "button";

            downloadBtn.addEventListener("click", () => {
                downloadPhoto(photo);
            });

            wrapper.appendChild(img);
            wrapper.appendChild(deleteBtn);
            wrapper.appendChild(downloadBtn);
            imageGallery.appendChild(wrapper);

        } catch (err) {
            console.error(`No se pudo cargar la foto ${photo.name}`, err);
        }

    }

}

// -------------------- ELIMINAR UNA FOTO DE UN DÍA

async function deletePhoto(photoId) {

    if (!activeDateKey) return;

    const confirmado = confirm(
        "¿Seguro que quieres eliminar esta foto? No se puede deshacer."
    );

    if (!confirmado) return;

    setSaveStatus("saving", "Eliminando foto...");

    try {

        await drive.deletePhoto(photoId);

        activeDayData.photos = activeDayData.photos.filter(
            (p) => p.id !== photoId
        );

        await drive.saveDay(activeDateKey, activeDayData);

        await renderGallery();
        await updateDayCellPreview();

        setSaveStatus("saved", "Foto eliminada ✓");

    } catch (err) {
        console.error(err);
        setSaveStatus("error", "No se pudo eliminar la foto.");
        alert("No se pudo eliminar la foto. Revisa la consola.");
    }

}

// -------------------- DESCARGAR UNA FOTO INDIVIDUAL

async function downloadPhoto(photo) {

    try {

        const blobUrl = await drive.getPhotoBlobUrl(photo.id);

        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = photo.name || "foto.jpg";

        document.body.appendChild(a);
        a.click();
        a.remove();

        // Pequeño margen antes de liberar la memoria, para dar
        // tiempo a que el navegador arranque la descarga
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    } catch (err) {
        console.error(err);
        alert("No se pudo descargar la foto. Revisa la consola.");
    }

}

// -------------------- ACTUALIZAR LA MINIATURA DEL DÍA EN EL GRID

async function updateDayCellPreview() {

    if (!activeDayDiv) return;

    if (activeDayData.photos.length > 0) {

        const thumbUrl = await drive.getPhotoThumbnail(
            activeDayData.photos[0].id
        );

        if (thumbUrl) {

            activeDayDiv.style.backgroundImage = `url(${thumbUrl})`;
            activeDayDiv.style.backgroundSize = "cover";
            activeDayDiv.style.backgroundPosition = "center";
            activeDayDiv.textContent = "";
            activeDayDiv.classList.add("has-image");

        }

    } else {

        activeDayDiv.style.backgroundImage = "";
        activeDayDiv.classList.remove("has-image");
        activeDayDiv.textContent = activeDayDiv.dataset.label || "";

    }

}

// -------------------- INDICADOR DE GUARDADO

let saveStatusClearTimeout = null;

function setSaveStatus(state, message) {

    if (!saveStatusEl) return;

    clearTimeout(saveStatusClearTimeout);

    saveStatusEl.textContent = message;
    saveStatusEl.className = state || "";

    if (state === "saved") {

        saveStatusClearTimeout = setTimeout(() => {
            saveStatusEl.textContent = "";
            saveStatusEl.className = "";
        }, 2000);

    }

}

// -------------------- COMPRIMIR FOTOS ANTES DE SUBIR
// Reducimos el tamaño de la imagen antes de mandarla a Drive: así
// las subidas van más rápido y ocupan mucho menos espacio, sin que
// se note la diferencia al verla en el móvil.

function resizeImageFile(file, maxDimension = 2000, quality = 0.85) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {

            const img = new Image();

            img.onload = () => {

                let { width, height } = img;

                if (width > maxDimension || height > maxDimension) {

                    if (width > height) {
                        height = Math.round(height * (maxDimension / width));
                        width = maxDimension;
                    } else {
                        width = Math.round(width * (maxDimension / height));
                        height = maxDimension;
                    }

                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                canvas.getContext("2d").drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {

                    if (!blob) {
                        reject(new Error("No se pudo comprimir la imagen."));
                        return;
                    }

                    const compressedFile = new File(
                        [blob],
                        file.name.replace(/\.\w+$/, "") + ".jpg",
                        { type: "image/jpeg" }
                    );

                    resolve(compressedFile);

                }, "image/jpeg", quality);

            };

            img.onerror = () => reject(new Error("No se pudo leer la imagen."));

            img.src = reader.result;

        };

        reader.onerror = () => reject(new Error("No se pudo leer el archivo."));

        reader.readAsDataURL(file);

    });

}

// -------------------- CREAR CALENDARIO

let date = new Date(startDate);

let currentMonth = null;
let currentYear = null;

while (date <= today) {

    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();

    const weekDay = weekDaysShort[date.getDay()];

    if (year !== currentYear) {

        const title = document.createElement("div");
        title.className = "year-title";
        title.textContent = year;

        grid.appendChild(title);

        currentYear = year;
        currentMonth = null;
    }

    if (month !== currentMonth) {

        const title = document.createElement("div");
        title.className = "month-title";
        title.textContent = monthNamesLong[month];

        grid.appendChild(title);

        currentMonth = month;
    }

    const dateKey =
        `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dayDiv = document.createElement("div");

    dayDiv.className = "day";
    dayDiv.dataset.day = day;
    dayDiv.dataset.weekday = weekDay;

    dayDiv.textContent = `${day} ${monthNamesShort[month]}`;
    dayDiv.dataset.label = dayDiv.textContent;

    dayDiv.addEventListener("click", () => {
        openDay(dateKey, day, month, year, dayDiv);
    });

    grid.appendChild(dayDiv);
    dayDivs[dateKey] = dayDiv;

    date.setDate(date.getDate() + 1);
}

const todayKey =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

if (dayDivs[todayKey]) {

    dayDivs[todayKey].scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

}

// -------------------- IR A UN DÍA CONCRETO (desde el toolbar)

const startDateKey =
    `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2,"0")}-${String(startDate.getDate()).padStart(2,"0")}`;

jumpDateInput.min = startDateKey;
jumpDateInput.max = todayKey;

jumpDateInput.addEventListener("change", () => {

    const value = jumpDateInput.value;

    if (!value) return;

    goToDate(value);

    jumpDateInput.value = "";

});

function goToDate(dateKey) {

    const dayDiv = dayDivs[dateKey];

    if (!dayDiv) {

        alert(
            "Esa fecha está fuera del diario (entre el "
            + startDateKey + " y hoy)."
        );

        return;

    }

    // Si estábamos dentro de un día, volvemos primero al grid
    dayView.style.display = "none";
    gridView.style.display = "block";

    activeDateKey = null;
    activeDayDiv = null;
    activeDayData = null;

    dayDiv.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    dayDiv.classList.add("jump-highlight");

    setTimeout(() => {
        dayDiv.classList.remove("jump-highlight");
    }, 1500);

}

// -------------------- GUARDAR TEXTO (con retraso, para no saturar Drive)

let saveTextTimeout = null;

dayText.addEventListener("input", () => {

    if (!activeDateKey) return;

    activeDayData.text = dayText.value;

    setSaveStatus("saving", "Guardando...");

    clearTimeout(saveTextTimeout);

    saveTextTimeout = setTimeout(async () => {

        try {
            await drive.saveDay(activeDateKey, activeDayData);
            activeDayDiv.classList.add("has-entry");
            setSaveStatus("saved", "Guardado ✓");
        } catch (err) {
            console.error(err);
            setSaveStatus("error", "Error al guardar. Se reintentará al seguir escribiendo.");
        }

    }, 800);

});

// -------------------- GUARDAR ETIQUETAS (con el mismo retraso)

let saveTagsTimeout = null;

dayTagsInput.addEventListener("input", () => {

    if (!activeDateKey) return;

    activeDayData.tags = parseTags(dayTagsInput.value);

    updateTagChipsActiveState();

    setSaveStatus("saving", "Guardando...");

    clearTimeout(saveTagsTimeout);

    saveTagsTimeout = setTimeout(async () => {

        try {
            await drive.saveDay(activeDateKey, activeDayData);
            activeDayDiv.classList.add("has-entry");
            indexTags(activeDateKey, activeDayData.tags);
            setSaveStatus("saved", "Guardado ✓");
        } catch (err) {
            console.error(err);
            setSaveStatus("error", "Error al guardar. Se reintentará al seguir escribiendo.");
        }

    }, 800);

});

// -------------------- SUBIR IMAGEN

imageInput.addEventListener("change", async () => {

    const file = imageInput.files[0];

    if (!file || !activeDateKey) return;

    imageInput.value = "";

    setSaveStatus("saving", "Comprimiendo foto...");

    let compressedFile;

    try {
        compressedFile = await resizeImageFile(file);
    } catch (err) {
        console.error(err);
        setSaveStatus("error", "No se pudo procesar la foto.");
        alert("No se pudo procesar la foto. Revisa la consola.");
        return;
    }

    // Vista previa inmediata mientras se sube a Drive
    const previewUrl = URL.createObjectURL(compressedFile);

    const previewImg = document.createElement("img");
    previewImg.src = previewUrl;
    previewImg.className = "day-photo";
    imageGallery.appendChild(previewImg);

    activeDayDiv.style.backgroundImage = `url(${previewUrl})`;
    activeDayDiv.style.backgroundSize = "cover";
    activeDayDiv.style.backgroundPosition = "center";
    activeDayDiv.textContent = "";
    activeDayDiv.classList.add("has-image");

    setSaveStatus("saving", "Subiendo foto...");

    try {

        const uploaded = await drive.uploadPhoto(compressedFile);

        activeDayData.photos.push({
            id: uploaded.id,
            name: uploaded.name
        });

        await drive.saveDay(activeDateKey, activeDayData);

        activeDayDiv.classList.add("has-entry");

        await renderGallery();

        setSaveStatus("saved", "Foto guardada ✓");

    } catch (err) {
        console.error(err);
        setSaveStatus("error", "No se pudo subir la foto.");
        alert("No se pudo subir la foto a Drive. Revisa la consola.");
    }

});

// -------------------- VOLVER

backButton.addEventListener("click", () => {

    dayView.style.display = "none";
    gridView.style.display = "block";

    activeDateKey = null;
    activeDayDiv = null;
    activeDayData = null;

});

// -------------------- BUSCADOR POR ETIQUETA

searchBtn.addEventListener("click", (event) => {

    event.stopPropagation();

    if (!driveReady) {
        alert("Primero tienes que iniciar sesión con Google.");
        return;
    }

    const show = searchPanel.style.display === "none";

    searchPanel.style.display = show ? "block" : "none";

    if (show) {
        searchInput.value = "";
        searchResults.innerHTML = "";
        searchInput.focus();
    }

});

document.addEventListener("click", (event) => {

    if (
        searchPanel.style.display !== "none" &&
        !searchPanel.contains(event.target) &&
        event.target !== searchBtn
    ) {
        searchPanel.style.display = "none";
    }

});

searchInput.addEventListener("input", () => {
    renderSearchResults(searchInput.value.trim().toLowerCase());
});

let searchRequestId = 0;

async function renderSearchResults(query) {

    if (!query) {
        searchResults.innerHTML = "";
        return;
    }

    const cleanQuery = query.replace(/^#/, "");

    const matchingTagKeys = Object.keys(tagIndex).filter(
        (tag) => tag.includes(cleanQuery)
    );

    const dateSet = new Set();

    matchingTagKeys.forEach((tag) => {
        tagIndex[tag].forEach((dateKey) => dateSet.add(dateKey));
    });

    const dates = Array.from(dateSet).sort().reverse();

    if (dates.length === 0) {

        searchResults.innerHTML = "";

        const empty = document.createElement("div");
        empty.className = "search-empty";
        empty.textContent = "No hay días con esa etiqueta.";

        searchResults.appendChild(empty);

        return;

    }

    // Si el usuario sigue escribiendo mientras cargan las miniaturas,
    // esto evita que una búsqueda antigua pinte resultados por encima
    // de la búsqueda más reciente.
    const requestId = ++searchRequestId;

    const thumbs = await Promise.all(
        dates.map((dateKey) => buildSearchResultThumb(dateKey))
    );

    if (requestId !== searchRequestId) return;

    searchResults.innerHTML = "";

    thumbs.forEach((thumb) => searchResults.appendChild(thumb));

}

async function buildSearchResultThumb(dateKey) {

    const dayData = dayDataCache[dateKey];
    const [year, month, day] = dateKey.split("-").map(Number);

    const thumb = document.createElement("div");
    thumb.className = "search-result-thumb";

    if (dayData?.tags?.length) {
        thumb.title = formatTags(dayData.tags);
    }

    if (dayData?.photos?.length > 0) {

        try {

            const url = await drive.getPhotoThumbnail(dayData.photos[0].id);

            if (url) {
                thumb.style.backgroundImage = `url(${url})`;
            }

        } catch (err) {
            console.error(`No se pudo cargar la miniatura de ${dateKey}`, err);
        }

    }

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = `${day} ${monthNamesShort[month - 1]} ${year}`;

    thumb.appendChild(label);

    thumb.addEventListener("click", () => {
        searchPanel.style.display = "none";
        goToDate(dateKey);
    });

    return thumb;

}

// -------------------- COPIA DE SEGURIDAD (.zip)

exportBackupBtn.addEventListener("click", exportBackup);

async function exportBackup() {

    if (!driveReady) {
        alert("Primero tienes que iniciar sesión con Google.");
        return;
    }

    const confirmado = confirm(
        "Vamos a preparar un archivo .zip con todos tus textos y fotos. " +
        "Si tienes muchas fotos, puede tardar un rato. ¿Continuar?"
    );

    if (!confirmado) return;

    const originalLabel = exportBackupBtn.textContent;

    exportBackupBtn.disabled = true;
    exportBackupBtn.textContent = "Preparando copia...";

    try {

        const zip = new JSZip();
        const allEntries = {};

        const years = [];

        for (let y = startDate.getFullYear(); y <= today.getFullYear(); y++) {
            years.push(y);
        }

        for (const year of years) {

            let dates;

            try {
                dates = await drive.listDatesInYear(year);
            } catch (err) {
                console.error(`No se pudieron listar los días de ${year}`, err);
                continue;
            }

            for (const dateKey of dates) {

                exportBackupBtn.textContent = `Descargando ${dateKey}...`;

                let dayData;

                try {
                    dayData = dayDataCache[dateKey] || await drive.loadDay(dateKey);
                } catch (err) {
                    console.error(`No se pudo leer ${dateKey}`, err);
                    continue;
                }

                allEntries[dateKey] = {
                    text: dayData.text || "",
                    tags: dayData.tags || []
                };

                const photos = dayData.photos || [];

                for (let i = 0; i < photos.length; i++) {

                    const photo = photos[i];

                    try {

                        const blobUrl = await drive.getPhotoBlobUrl(photo.id);
                        const response = await fetch(blobUrl);
                        const blob = await response.blob();

                        const extensionMatch = photo.name.match(/\.\w+$/);
                        const extension = extensionMatch ? extensionMatch[0] : ".jpg";

                        const suffix = photos.length > 1 ? `-${i + 1}` : "";
                        const fileName = `${dateKey}${suffix}${extension}`;

                        zip.file(`fotos/${fileName}`, blob);

                        URL.revokeObjectURL(blobUrl);

                    } catch (err) {
                        console.error(`No se pudo descargar la foto de ${dateKey}`, err);
                    }

                }

            }

        }

        zip.file("entradas.json", JSON.stringify(allEntries, null, 2));

        exportBackupBtn.textContent = "Generando archivo .zip...";

        const zipBlob = await zip.generateAsync({ type: "blob" });

        const url = URL.createObjectURL(zipBlob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `one-true-second-backup-${todayKey}.zip`;

        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);

        exportBackupBtn.textContent = "Copia descargada ✓";

        setTimeout(() => {
            exportBackupBtn.textContent = originalLabel;
            exportBackupBtn.disabled = false;
        }, 3000);

    } catch (err) {

        console.error(err);
        alert("No se pudo generar la copia de seguridad. Revisa la consola.");

        exportBackupBtn.textContent = originalLabel;
        exportBackupBtn.disabled = false;

    }

}

// -------------------- ADMINISTRADOR DE ETIQUETAS

let tagManagerBusy = false;

tagManagerBtn.addEventListener("click", (event) => {

    event.stopPropagation();

    if (!driveReady) {
        alert("Primero tienes que iniciar sesión con Google.");
        return;
    }

    const show = tagManagerPanel.style.display === "none";

    tagManagerPanel.style.display = show ? "block" : "none";

    if (show) {
        tagManagerStatus.textContent = "";
        renderTagManagerList();
    }

});

document.addEventListener("click", (event) => {

    if (
        tagManagerPanel.style.display !== "none" &&
        !tagManagerPanel.contains(event.target) &&
        event.target !== tagManagerBtn
    ) {
        tagManagerPanel.style.display = "none";
    }

});

function renderTagManagerList() {

    tagManagerList.innerHTML = "";

    const keys = Object.keys(tagDisplayNames).sort();

    if (keys.length === 0) {

        const empty = document.createElement("div");
        empty.className = "search-empty";
        empty.textContent = "Todavía no has usado ninguna etiqueta.";

        tagManagerList.appendChild(empty);

        return;

    }

    keys.forEach((key) => {

        const count = tagIndex[key] ? tagIndex[key].size : 0;

        const row = document.createElement("div");
        row.className = "tag-manager-row";

        const info = document.createElement("div");

        const nameSpan = document.createElement("span");
        nameSpan.className = "tag-name";
        nameSpan.textContent = `#${tagDisplayNames[key]}`;

        const countSpan = document.createElement("span");
        countSpan.className = "tag-count";
        countSpan.textContent = `(${count} día${count === 1 ? "" : "s"})`;

        info.appendChild(nameSpan);
        info.appendChild(countSpan);

        const actions = document.createElement("div");
        actions.className = "tag-manager-actions";

        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "rename-btn";
        renameBtn.textContent = "Renombrar";
        renameBtn.addEventListener("click", () => handleRenameTag(key));

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "Eliminar";
        deleteBtn.addEventListener("click", () => handleDeleteTag(key));

        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(info);
        row.appendChild(actions);

        tagManagerList.appendChild(row);

    });

}

async function handleRenameTag(oldKey) {

    if (tagManagerBusy) return;

    const currentName = tagDisplayNames[oldKey];

    const input = prompt(
        `Nuevo nombre para la etiqueta #${currentName}:`,
        currentName
    );

    if (input === null) return; // cancelado

    const parsed = parseTags(input);

    if (parsed.length === 0) {
        alert("El nuevo nombre no puede estar vacío.");
        return;
    }

    const newTagName = parsed[0];
    const newKey = newTagName.toLowerCase();

    if (newKey === oldKey) return;

    await applyTagChangeToAllDays(

        oldKey,

        (tags) => {

            const withoutOld = tags.filter((t) => t.toLowerCase() !== oldKey);
            const alreadyHasNew = withoutOld.some((t) => t.toLowerCase() === newKey);

            return alreadyHasNew ? withoutOld : [...withoutOld, newTagName];

        },

        `Renombrando #${currentName} a #${newTagName}`

    );

    renderTagManagerList();

}

async function handleDeleteTag(key) {

    if (tagManagerBusy) return;

    const currentName = tagDisplayNames[key];
    const count = tagIndex[key] ? tagIndex[key].size : 0;

    const confirmado = confirm(
        `¿Eliminar la etiqueta #${currentName} de ${count} día(s)? No se puede deshacer.`
    );

    if (!confirmado) return;

    await applyTagChangeToAllDays(

        key,

        (tags) => tags.filter((t) => t.toLowerCase() !== key),

        `Eliminando #${currentName}`

    );

    renderTagManagerList();

}

async function applyTagChangeToAllDays(key, transformFn, progressLabel) {

    const dateKeys = Array.from(tagIndex[key] || []);

    if (dateKeys.length === 0) return;

    tagManagerBusy = true;

    for (let i = 0; i < dateKeys.length; i++) {

        const dateKey = dateKeys[i];

        tagManagerStatus.textContent =
            `${progressLabel}... (${i + 1}/${dateKeys.length})`;

        try {

            let dayData = dayDataCache[dateKey];

            if (!dayData) {
                dayData = await drive.loadDay(dateKey);
                dayDataCache[dateKey] = dayData;
            }

            dayData.tags = transformFn(dayData.tags || []);

            await drive.saveDay(dateKey, dayData);

            indexTags(dateKey, dayData.tags);

            if (dateKey === activeDateKey) {
                dayTagsInput.value = formatTags(dayData.tags);
                updateTagChipsActiveState();
            }

        } catch (err) {
            console.error(`No se pudo actualizar ${dateKey}`, err);
        }

    }

    // Si la etiqueta original se quedó sin ningún día, la quitamos
    // del todo para que no aparezca con (0 días)
    if (!tagIndex[key] || tagIndex[key].size === 0) {
        delete tagIndex[key];
        delete tagDisplayNames[key];
    }

    tagManagerBusy = false;

    tagManagerStatus.textContent = "Hecho ✓";

    setTimeout(() => {
        tagManagerStatus.textContent = "";
    }, 2000);

}
