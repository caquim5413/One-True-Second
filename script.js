// -------------------- ELEMENTOS DEL DOM

const grid = document.querySelector(".grid");
const gridView = document.getElementById("grid-view");
const dayView = document.getElementById("day-view");

const dayTitle = document.getElementById("day-title");
const dayText = document.getElementById("day-text");

const backButton = document.getElementById("back");
const imageInput = document.getElementById("image-input");
const imageGallery = document.getElementById("image-gallery");

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
    imageInput.disabled = true;
    imageGallery.innerHTML = "";

    let dayData;

    try {
        dayData = await drive.loadDay(dateKey);
    } catch (err) {
        console.error(err);
        alert("No se pudo cargar este día. Revisa la consola.");
        dayData = { text: "", photos: [] };
    }

    dayData.photos = dayData.photos || [];

    activeDayData = dayData;

    dayText.value = dayData.text || "";
    dayText.disabled = false;
    imageInput.disabled = false;
    imageInput.value = "";

    await renderGallery();

}

// -------------------- PINTAR LA GALERÍA DEL DÍA ABIERTO

async function renderGallery() {

    imageGallery.innerHTML = "";

    for (const photo of activeDayData.photos) {

        try {

            const url = await drive.getPhotoThumbnail(photo.id, 1000);

            const img = document.createElement("img");
            img.src = url;
            img.className = "day-photo";

            imageGallery.appendChild(img);

        } catch (err) {
            console.error(`No se pudo cargar la foto ${photo.name}`, err);
        }

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
