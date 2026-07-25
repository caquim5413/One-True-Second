// ============================================
// One True Second
// DriveService
// ============================================

class DriveService {

    constructor() {

        this.accessToken = null;

        // IDs importantes
        this.rootId = null;
        this.dataId = null;
        this.photosId = null;
        this.daysId = null;

        // Cache para evitar consultas repetidas
        this.folderCache = {};
        this.fileCache = {};

    }

    // ============================================
    // LOGIN
    // ============================================

    setAccessToken(token) {

        this.accessToken = token;

    }

    // ============================================
    // PETICIONES A GOOGLE
    // ============================================

    async request(url, options = {}) {

        if (!this.accessToken) {

            throw new Error("No existe accessToken.");

        }

        options.headers = {

            ...(options.headers || {}),

            Authorization: `Bearer ${this.accessToken}`

        };

        const response = await fetch(
            url,
            options
        );

        if (!response.ok) {

            console.error(await response.text());

            throw new Error(
                `Google Drive respondió ${response.status}`
            );

        }

        if (response.status === 204)
            return null;

        return await response.json();

    }

    // ============================================
    // INIT
    // ============================================

    async init() {

        console.log("Inicializando Drive...");

        await this.ensureStructure();

        console.log("Drive listo.");

    }

    // ============================================
    // ESTRUCTURA
    // ============================================

    async ensureStructure() {

        this.rootId = await this.ensureFolder(
            "One True Second"
        );

        [this.dataId, this.photosId] = await Promise.all([

            this.ensureFolder("data", this.rootId),

            this.ensureFolder("photos", this.rootId)

        ]);

        this.daysId = await this.ensureFolder(
            "days",
            this.dataId
        );

    }

    // ============================================
    // CARPETAS
    // ============================================

    async ensureFolder(name, parentId = null) {

        const cacheKey =
            `${parentId ?? "root"}:${name}`;

        if (this.folderCache[cacheKey])
            return this.folderCache[cacheKey];

        const folder = await this.findFolder(
            name,
            parentId
        );

        if (folder) {

            this.folderCache[cacheKey] = folder.id;

            return folder.id;

        }

        const created = await this.createFolder(
            name,
            parentId
        );

        this.folderCache[cacheKey] = created.id;

        return created.id;

    }

    async findFolder(name, parentId = null) {

        let query = [

            `name='${name}'`,

            `mimeType='application/vnd.google-apps.folder'`,

            `trashed=false`

        ];

        if (parentId) {

            query.push(
                `'${parentId}' in parents`
            );

        }

        const result = await this.request(

            "https://www.googleapis.com/drive/v3/files?q="
            + encodeURIComponent(query.join(" and "))

        );

        if (result.files.length === 0)
            return null;

        return result.files[0];

    }

    async createFolder(name, parentId = null) {

        const metadata = {

            name,

            mimeType:
                "application/vnd.google-apps.folder"

        };

        if (parentId) {

            metadata.parents = [parentId];

        }

        return await this.request(

            "https://www.googleapis.com/drive/v3/files",

            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body: JSON.stringify(metadata)

            }

        );

    }

    // ============================================
    // AÑO
    // ============================================

    async ensureYearFolder(year) {

        return await this.ensureFolder(

            String(year),

            this.daysId

        );

    }
    // ============================================
    // DIARIO
    // ============================================

    getYear(date) {

        return date.substring(0, 4);

    }

    async saveDay(date, data) {

        const yearId = await this.ensureYearFolder(
            this.getYear(date)
        );

        await this.saveJson(

            `${date}.json`,

            data,

            yearId

        );

        console.log(`💾 ${date} guardado`);

    }

    async loadDay(date) {

        const yearId = await this.ensureYearFolder(
            this.getYear(date)
        );

        const json = await this.loadJson(

            `${date}.json`,

            yearId

        );

        if (json)
            return json;

        return {

            text: "",

            photos: []

        };

    }

    async deleteDay(date) {

        const yearId = await this.ensureYearFolder(
            this.getYear(date)
        );

        const file = await this.findFile(

            `${date}.json`,

            yearId

        );

        if (!file)
            return;

        await this.deleteFile(file.id);

        delete this.fileCache[
            `${yearId}:${date}.json`
        ];

    }

    // ============================================
    // FOTOS
    // ============================================

    async ensurePhotoYearFolder(year) {

        return await this.ensureFolder(

            String(year),

            this.photosId

        );

    }

    async uploadPhoto(file) {

        const year = new Date()
            .getFullYear()
            .toString();

        const parentId =
            await this.ensurePhotoYearFolder(year);

        const metadata = {

            name: file.name,

            parents: [parentId]

        };

        const form = new FormData();

        form.append(

            "metadata",

            new Blob(

                [JSON.stringify(metadata)],

                {

                    type:
                        "application/json"

                }

            )

        );

        form.append(

            "file",

            file

        );

        const uploaded =
            await this.request(

                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",

                {

                    method: "POST",

                    body: form

                }

            );

        return {

            id: uploaded.id,

            name: uploaded.name

        };

    }

    async getPhotoUrl(id) {

        return `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;

    }

    // Pide solo la miniatura que Drive ya genera automáticamente,
    // en vez de descargar la foto entera. Mucho más rápido para
    // pintar el grid o la galería.
    async getPhotoThumbnail(id, size = 800) {

        const meta = await this.request(

            `https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink`

        );

        if (!meta.thumbnailLink) return null;

        // El link viene como "...=s220", cambiamos el tamaño
        if (/=s\d+$/.test(meta.thumbnailLink)) {
            return meta.thumbnailLink.replace(/=s\d+$/, `=s${size}`);
        }

        return meta.thumbnailLink;

    }

    // Como las fotos son privadas, un <img src="..."> normal no
    // funciona (Drive exige la cabecera Authorization). Por eso
    // las descargamos y creamos una URL local temporal (blob).
    // Úsalo solo si necesitas la foto en resolución completa.
    async getPhotoBlobUrl(id) {

        const response = await fetch(

            `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,

            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`
                }
            }

        );

        if (!response.ok) {
            throw new Error("No se pudo cargar la foto.");
        }

        const blob = await response.blob();

        return URL.createObjectURL(blob);

    }

    async deletePhoto(id) {

        await this.deleteFile(id);

    }

    // ============================================
    // DEBUG
    // ============================================

    printStatus() {

        console.log({

            root: this.rootId,

            data: this.dataId,

            days: this.daysId,

            photos: this.photosId

        });

    }

    // ============================================
    // LISTAR DÍAS CON ENTRADA (para pintar el grid)
    // ============================================

    async listDatesInYear(year) {

        const yearId = await this.ensureYearFolder(year);

        const query = [

            `'${yearId}' in parents`,

            `trashed=false`

        ].join(" and ");

        const result = await this.request(

            "https://www.googleapis.com/drive/v3/files?q="
            + encodeURIComponent(query)
            + "&fields=files(id,name)"

        );

        // Devuelve las fechas (sin ".json") de los días que ya existen
        return result.files.map(f => f.name.replace(".json", ""));

    }

    // ============================================
    // ARCHIVOS
    // ============================================

    async findFile(name, parentId) {

        const cacheKey = `${parentId}:${name}`;

        if (this.fileCache[cacheKey])
            return this.fileCache[cacheKey];

        const query = [

            `'${parentId}' in parents`,

            `name='${name}'`,

            `trashed=false`

        ].join(" and ");

        const result = await this.request(

            "https://www.googleapis.com/drive/v3/files?q=" +
            encodeURIComponent(query)

        );

        if (result.files.length === 0)
            return null;

        this.fileCache[cacheKey] = result.files[0];

        return result.files[0];

    }

    async uploadTextFile(name, text, parentId) {

        const metadata = {

            name,

            parents: [parentId]

        };

        const form = new FormData();

        form.append(

            "metadata",

            new Blob(
                [JSON.stringify(metadata)],
                { type: "application/json" }
            )

        );

        form.append(

            "file",

            new Blob(
                [text],
                { type: "application/json" }
            )

        );

        return await this.request(

            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",

            {

                method: "POST",

                body: form

            }

        );

    }

    async updateTextFile(fileId, text) {

        return await this.request(

            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,

            {

                method: "PATCH",

                headers: {

                    "Content-Type": "application/json"

                },

                body: text

            }

        );

    }

    async readTextFile(fileId) {

        const response = await fetch(

            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,

            {

                headers: {

                    Authorization:
                        `Bearer ${this.accessToken}`

                }

            }

        );

        if (!response.ok) {

            throw new Error(
                "No se pudo leer el archivo."
            );

        }

        return await response.text();

    }

    async deleteFile(fileId) {

        await this.request(

            `https://www.googleapis.com/drive/v3/files/${fileId}`,

            {

                method: "DELETE"

            }

        );

    }

    async saveJson(name, object, parentId) {

        const existing = await this.findFile(
            name,
            parentId
        );

        const text = JSON.stringify(
            object,
            null,
            2
        );

        if (!existing) {

            const file = await this.uploadTextFile(

                name,

                text,

                parentId

            );

            this.fileCache[
                `${parentId}:${name}`
            ] = file;

            return file;

        }

        await this.updateTextFile(
            existing.id,
            text
        );

        return existing;

    }

    async loadJson(name, parentId) {

        const file = await this.findFile(
            name,
            parentId
        );

        if (!file)
            return null;

        const text = await this.readTextFile(
            file.id
        );

        return JSON.parse(text);

    }

}

const drive = new DriveService();
