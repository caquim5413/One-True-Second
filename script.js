// -------------------- ELEMENTOS DEL DOM

const grid = document.querySelector(".grid");
const gridView = document.getElementById("grid-view");
const dayView = document.getElementById("day-view");

const dayTitle = document.getElementById("day-title");
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

    });

}

function removeFromTagIndex(dateKey) {

    Object.values(tagIndex).forEach((set) => set.delete(dateKey));

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
    imageGallery.innerHTML = "";

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
    dayTagsInput.disabled = false;

    imageInput.disabled = false;
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

            wrapper.appendChild(img);
            wrapper.appendChild(deleteBtn);
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

    try {

        await drive.deletePhoto(photoId);

        activeDayData.photos = activeDayData.photos.filter(
            (p) => p.id !== photoId
        );

        await drive.saveDay(activeDateKey, activeDayData);

        await renderGallery();
        await updateDayCellPreview();

    } catch (err) {
        console.error(err);
        alert("No se pudo eliminar la foto. Revisa la consola.");
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

    clearTimeout(saveTextTimeout);

    saveTextTimeout = setTimeout(async () => {

        try {
            await drive.saveDay(activeDateKey, activeDayData);
            activeDayDiv.classList.add("has-entry");
        } catch (err) {
            console.error(err);
        }

    }, 800);

});

// -------------------- GUARDAR ETIQUETAS (con el mismo retraso)

let saveTagsTimeout = null;

dayTagsInput.addEventListener("input", () => {

    if (!activeDateKey) return;

    activeDayData.tags = parseTags(dayTagsInput.value);

    clearTimeout(saveTagsTimeout);

    saveTagsTimeout = setTimeout(async () => {

        try {
            await drive.saveDay(activeDateKey, activeDayData);
            activeDayDiv.classList.add("has-entry");
            indexTags(activeDateKey, activeDayData.tags);
        } catch (err) {
            console.error(err);
        }

    }, 800);

});

// -------------------- SUBIR IMAGEN

imageInput.addEventListener("change", () => {

    const file = imageInput.files[0];

    if (!file || !activeDateKey) return;

    // Vista previa inmediata mientras se sube a Drive
    const reader = new FileReader();

    reader.onload = async () => {

        const previewImg = document.createElement("img");
        previewImg.src = reader.result;
        previewImg.className = "day-photo";
        imageGallery.appendChild(previewImg);

        activeDayDiv.style.backgroundImage = `url(${reader.result})`;
        activeDayDiv.style.backgroundSize = "cover";
        activeDayDiv.style.backgroundPosition = "center";
        activeDayDiv.textContent = "";
        activeDayDiv.classList.add("has-image");

        try {

            const uploaded = await drive.uploadPhoto(file);

            activeDayData.photos.push({
                id: uploaded.id,
                name: uploaded.name
            });

            await drive.saveDay(activeDateKey, activeDayData);

            activeDayDiv.classList.add("has-entry");

        } catch (err) {
            console.error(err);
            alert("No se pudo subir la foto a Drive. Revisa la consola.");
        }

    };

    reader.readAsDataURL(file);

    imageInput.value = "";

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

function renderSearchResults(query) {

    searchResults.innerHTML = "";

    if (!query) return;

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

        const empty = document.createElement("div");
        empty.className = "search-empty";
        empty.textContent = "No hay días con esa etiqueta.";

        searchResults.appendChild(empty);

        return;

    }

    dates.forEach((dateKey) => {

        const dayData = dayDataCache[dateKey];
        const [year, month, day] = dateKey.split("-").map(Number);

        const row = document.createElement("div");
        row.className = "search-result";

        const dateLabel = document.createElement("div");
        dateLabel.textContent =
            `${day} de ${monthNamesLong[month - 1]} de ${year}`;

        row.appendChild(dateLabel);

        if (dayData?.tags?.length) {

            const tagsLine = document.createElement("div");
            tagsLine.className = "tags";
            tagsLine.textContent = formatTags(dayData.tags);

            row.appendChild(tagsLine);

        }

        row.addEventListener("click", () => {
            searchPanel.style.display = "none";
            goToDate(dateKey);
        });

        searchResults.appendChild(row);

    });

}
